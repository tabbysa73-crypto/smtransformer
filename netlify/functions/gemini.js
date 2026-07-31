exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { imageBase64, menuText } = body;
        
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Netlify 환경 변수에 GEMINI_API_KEY가 없습니다.' }) };
        }

        const base64Data = imageBase64.split(',')[1];
        const mimeType = imageBase64.split(';')[0].split(':')[1];

        const prompt = `주어진 식판 사진을 분석하고, 사용자가 입력한 식단 목록(${menuText || '정보 없음'})을 참고하여 각 음식의 위치에 맞는 매력적인 설명을 작성해줘. 응답은 무조건 JSON 배열이어야 해.`;

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

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // ⭐ 핵심 수정 부분: 구글 API가 에러(503 과부하 등)를 뱉었을 때 꼼꼼하게 처리
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `구글 API 서버 오류 (${response.status})`;
            
            try {
                // 구글이 보낸 에러 메시지(JSON) 분석 시도
                const errorJson = JSON.parse(errorText);
                if (errorJson.error && errorJson.error.message) {
                    errorMessage = errorJson.error.message;
                }
            } catch (e) {
                // JSON 파싱 실패시 원본 텍스트 사용
            }

            // 503 에러 또는 High Demand 문구가 있으면 친절한 한국어 메시지로 변경
            if (response.status === 503 || errorMessage.toLowerCase().includes('high demand')) {
                errorMessage = '현재 구글 AI 서버에 전 세계 사용자가 몰려 처리가 지연되고 있습니다. 1~2분 뒤에 다시 시도해주세요. (서버 과부하)';
            }

            return {
                statusCode: 200, // 프론트엔드로 안전하게 메시지를 전달하기 위해 200으로 보냄
                body: JSON.stringify({ error: errorMessage })
            };
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!responseText) {
             return { statusCode: 200, body: JSON.stringify({ error: 'AI 응답이 비어있습니다.' }) };
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
            statusCode: 200,
            body: JSON.stringify({ error: "코드 파싱 오류: " + error.message })
        };
    }
};
