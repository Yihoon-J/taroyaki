import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: 'us-east-1' });

export const handler = async (event) => {
    try {
        const env = 'product'; 
        
        const params = {
            Path: `/taroyaki/${env}/`,
            Recursive: true,
            WithDecryption: true
        };
        
        const command = new GetParametersByPathCommand(params);
        const response = await ssmClient.send(command);
        
        const config = {};
        response.Parameters.forEach(param => {
            // 전체 경로에서 마지막 부분만 추출
            const paramName = param.Name.split('/').pop();
            config[paramName] = param.Value;
        });
        
        // 추가 설정
        config.tokenRefreshThreshold = 5 * 60;
        config.sessionDuration = 3 * 60;
        config.tokenExpirations = {
            id: 60 * 60,
            access: 60 * 60,
            refresh: 5 * 24 * 60 * 60
        };
        

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(config)
        };
    } catch (error) {
        console.error('Error fetching configuration:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Failed to load configuration', details: error.message })
        };
    }
};