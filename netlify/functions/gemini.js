exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { imageBase64, menuText } = body;
        
        // 1. API 키와 모델 버전 환경 변수 불러오기
        const apiKey = process.env.GEMINI_API_KEY;
        // 환경 변수에 GEMINI_MODEL이 없으면 'gemini-1.5-flash'를 기본값으로 사용합니다.
        const modelVersion = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Netlify 환경 변수에 GEMINI_API_KEY가 없습니다.' }) };
        }

        // 이미지 데이터가 없거나 형식이 잘못된 경우 서버가 죽지 않고 에러 반환
        if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.includes(',')) {
             return { statusCode: 400, body: JSON.stringify({ error: '이미지 데이터가 잘못되었습니다. 사진을 다시 업로드해주세요.' }) };
        }

        const base64Data = imageBase64.split(',')[1];
        const mimeType = imageBase64.split(';')[0].split(':')[1];

        const prompt = "오늘의 실제 급식 메뉴 목록입니다: [" + (menuText || '정보 없음') + "]\n\n위 목록에 적힌 메뉴들을 텍스트에서 하나씩 순서대로 읽고, 사진 속에서 해당 음식(빵, 디저트, 소스 포함)의 위치를 찾아 무조건 1:1로 매칭해 주세요.\n\n(매우 중요) 메뉴 목록에 8개의 음식이 적혀 있다면, 반드시 응답 JSON 배열 안에도 8개의 항목이 정확히 들어있어야 합니다. 누락이나 요약은 절대 허용하지 않습니다.\n\n형식은 반드시 쌍따옴표를 사용한 JSON 배열이어야 합니다: [{\"name\": \"메뉴명\", \"description\": \"매력적인 설명\", \"position\": {\"x\": 0.5, \"y\": 0.5}}]";
        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: mimeType, data: base64Data } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            name: { type: "STRING" },
                            desc: { type: "STRING" }
                        }
                    }
                }
            }
        };

        // 2. fetch URL에 환경 변수(modelVersion) 적용하기
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API 거절:", errorText);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `구글 API 서버 응답 오류 (${response.status})` })
            };
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!responseText) {
             return { statusCode: 500, body: JSON.stringify({ error: 'AI 응답이 비어있습니다.' }) };
        }

        const parsedArray = JSON.parse(responseText);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsedArray)
        };

    } catch (error) {
        console.error("Netlify Function 내부 오류:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "코드 파싱 오류: " + error.message })
        };
    }
};
