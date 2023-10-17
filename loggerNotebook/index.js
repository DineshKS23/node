const axios = require('axios');
const sql = require('mssql');
const jwt = require('jsonwebtoken'); // Import the jsonwebtoken library

async function jwtCheck(context, req) {
    const jwtSecretKey = '12345678'; // Replace with your actual JWT secret key

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


async function createNotebook(content, path, databricksUrl, accessToken, edit, timeZone, projectId, userId) {
    try {
        let overwrite;

        if (edit) {
            // If editing, set 'overwrite' to true
            overwrite = true;
        } else {
            // If not editing, set 'overwrite' to false
            overwrite = false;
        }

        const notebook = {
            content,
            path,
            language: 'PYTHON',
            format: 'SOURCE',
            overwrite,
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
        const errorLogQuery = `
          INSERT INTO errorLog (errorMessage) VALUES (@errorMessage)
        `;

        const pool = await sql.connect(sqlConfig); // Re-establish the SQL connection

        const errorLogResult = await pool
            .request()
            .input('errorMessage', sql.NVarChar, error.message)
            .query(errorLogQuery);

        throw error; // Rethrow the error for the caller to handle
    }
}

module.exports = async function (context, req) {
    try {
        const isJwtValid = await jwtCheck(context, req);

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

        const { content, path, timeZone, databricksUrl, accessToken, edit, projectId, userId } = req.body;

        if (!databricksUrl || !accessToken || !projectId || !userId || (!timeZone && !edit)) {
            context.res = {
                status: 400,
                body: {
                    status_code: 400,
                    message: 'Databricks URL, Access Token, or content (when not editing) is missing in the request.',
                },
            };
            return;
        }

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

        const pool = await sql.connect(sqlConfig);

        if (!edit) {
            // If not editing, insert data into SQL database
            if (timeZone) {
                const sqlInsertQuery = `INSERT INTO projectDetails (timeZone) VALUES (@timeZone)`;
                await pool.request()
                    .input('timeZone', sql.VarChar, timeZone)
                    .input('projectId', sql.Int, projectId)
                    .input('userId', sql.Int, userId)
                    .query(sqlInsertQuery);
            }
        } else {
            // If editing, update data in SQL database (provide your update query)
            if (timeZone) {
                const sqlUpdateQuery = `UPDATE projectDetails SET timeZone = @timeZone 
                WHERE projectId = @projectId AND userId = @userId`;
                await pool.request()
                    .input('timeZone', sql.VarChar, timeZone)
                    .input('projectId', sql.Int, projectId)
                    .input('userId', sql.Int, userId)
                    .query(sqlUpdateQuery);
            }
        }

        // Create or edit a Databricks notebook
        const response = await createNotebook(content, path, databricksUrl, accessToken, edit, timeZone, projectId, userId);

        if (response.status === 200) {
            context.res = {
                status: 200,
                body: {
                    status_code: 200,
                    message: edit ? 'Notebook edited successfully.' : 'Data inserted into SQL and notebook created successfully.',
                    responseData: response.data, // Include the response data for debugging
                },
            };
        } else {
            context.res = {
                status: 500,
                body: {
                    status_code: 500,
                    message: 'Failed to create or edit the notebook.',
                    responseData: response.data, // Include the response data for debugging
                },
            };
        }
    } catch (error) {
        console.error('Error:', error);

        // Log the error in the "errorLog" table
        const errorLogQuery = `
          INSERT INTO errorLog (errorMessage) VALUES (@errorMessage)
        `;

        const errorLogPool = await sql.connect(sqlConfig); // Re-establish the SQL connection

        const errorLogResult = await errorLogPool
            .request()
            .input('errorMessage', sql.NVarChar, error.message)
            .query(errorLogQuery);

        context.res = {
            status: 500,
            body: {
                status_code: 500,
                message: 'Internal server error.',
            },
        };
    }
};