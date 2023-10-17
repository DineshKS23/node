const sql = require("mssql");
const jwt = require("jsonwebtoken"); // Import the jsonwebtoken library

async function jwtCheck(context, req) {

    // Check if the token in the Authorization header is valid
    try {
        const verified = jwt.verify(req.headers.authorization, process.env.jwtSecretKey);
        if (verified) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
}


module.exports = async function (context, req) {
    // Check JWT before proceeding
    const isJwtValid = await jwtCheck(context, req);

    if (!isJwtValid) {
        context.res = {
            status: 401,
            body: {
                status_code: 401,
                message: "Unauthorized: Invalid JWT token",
            },
        };
        return;
    }

    const config = {
        server: "localhost",
        database: "GenETL",
        user: "sa",
        password: "Admin123",
        options: {
            trustServerCertificate: true, // Use this if your SQL server requires SSL
        },
    };

    try {
        const { projectId, userId } = req.body; // Assuming projectId and userId are in the request body

        if (!projectId || !userId) {
            context.res = {
                status: 400,
                body: {
                    status_code: 400,
                    message: "Bad Request: Both projectId and userId are required.",
                },
            };
            return;
        }

        var pool = await sql.connect(config);
        const queryVar = `
          SELECT timeZone FROM projectDetails
          WHERE projectId = @projectId AND userId = @userId`; // Add WHERE clause

        const result = await pool
            .request()
            .input("projectId", sql.Int, projectId)
            .input("userId", sql.Int, userId)
            .query(queryVar);

        context.res = {
            status: 200,
            body: {
                status_code: 200,
                message: "Done",
                data: result.recordset,
            },
        };
    } catch (error) {
        context.log(error);

        // Log the error in the "errorLog" table
        const errorLogQuery = `
          INSERT INTO errorLog (errorMessage) VALUES (@errorMessage)
        `;

        const errorLogResult = await pool
            .request()
            .input("errorMessage", sql.NVarChar, error.message)
            .query(errorLogQuery);

        context.res = {
            status: 500,
            body: {
                status_code: 500,
                message: "Internal Server Error",
                error: error.message,
            },
        };
    } finally {
        if (pool) {
            pool.close();
        }
    }
};
