const axios = require('axios');
const sql = require('mssql');
const jwt = require('jsonwebtoken'); // Import the jsonwebtoken library

// Define SQL connection configuration
const sqlConfig = {
    server: "localhost",
        database: "GenETL",
        user: "sa",
        password: "Admin123",
        options: {
            trustServerCertificate: true, // Use this if your SQL server requires SSL
        },
};

// Function to log an error in the errorLog table
async function logError(pool, errorMessage) {
    try {
        const errorLogQuery = `
            INSERT INTO errorLog (errorMessage, timestamp) 
            VALUES (@errorMessage, GETDATE())`;
        
        await pool.request()
            .input('errorMessage', sql.NVarChar, errorMessage)
            .query(errorLogQuery);
    } catch (error) {
        console.error('Error logging to errorLog:', error);
    }
}

// Function to validate JWT token
async function jwtCheck(req) {
    const jwtSecretKey = 'your-secret-key'; // Replace with your secret key

    try {
        const verified = jwt.verify(req.headers.authorization, jwtSecretKey);
        if (verified) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
}

async function createNotebook(content, path, databricksUrl, accessToken) {
    try {
        const notebook = {
            content,
            path,
            language: 'PYTHON',
            format: 'SOURCE',
            overwrite: true,
        };

        const createNotebookUrl = `${databricksUrl}/api/2.0/workspace/import`;

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };

        const response = await axios.post(createNotebookUrl, notebook, { headers });

        return response;
    } catch (error) {
        console.error('Error creating notebook:', error);
        // Log the error in the "errorLog" table
        const pool = await sql.connect(sqlConfig);
        await logError(pool, error.message);

        throw error; // Rethrow the error for the caller to handle
    }
}

module.exports = async function (context, req) {
    try {
        const { content, path, accessToken, databricksUrl } = req.body;

        // Check JWT token before proceeding
        const isJwtValid = await jwtCheck(req);

        if (!isJwtValid) {
            context.res = {
                status: 401,
                body: {
                    status_code: 401,
                    message: 'Unauthorized: Invalid JWT token',
                },
            };
            return;
        }

        const response = await createNotebook(content, path, databricksUrl, accessToken);

        if (response.status === 200) {
            context.res = {
                status: 200,
                body: {
                    status_code: 200,
                    message: 'Notebook created successfully.',
                    responseData: response.data, // Include the response data for debugging
                },
            };
        } else {
            context.res = {
                status: 500,
                body: {
                    status_code: 500,
                    message: 'Failed to create notebook.',
                    responseData: response.data, // Include the response data for debugging
                },
            };
        }
    } catch (error) {
        console.error('Error:', error);
        // Log the error in the "errorLog" table
        const pool = await sql.connect(sqlConfig);
        await logError(pool, error.message);

        context.res = {
            status: 500,
            body: {
                status_code: 500,
                message: 'Internal server error.',
            },
        };
    }
};
