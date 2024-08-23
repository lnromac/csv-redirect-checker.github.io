import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// Proper initialization of __filename and __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.static('public'));

function normalizeUrl(url) {
    // Add https:// if missing
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }

    // Remove the scheme (https:// or http://)
    url = url.replace(/^https?:\/\//i, '');

    // Remove trailing slash if present
    url = url.replace(/\/$/, '');

    return url;
}


function areUrlsEquivalent(url1, url2) {
    const normalizedUrl1 = normalizeUrl(url1);
    const normalizedUrl2 = normalizeUrl(url2);
    console.log(normalizedUrl1 , normalizedUrl2)
    return normalizedUrl1 === normalizedUrl2;
}

// Function to check if a URL redirects correctly
async function checkRedirect(oldUrl, newUrl) {
    try {
        const response = await fetch(oldUrl, { method: 'HEAD', redirect: 'follow' });
        // // if (!/^https?:\/\//i.test(newUrl)) {
        // //     newUrl = `https://www.${newUrl}`;
        // // }
        // if (newUrl === 'trajectdata.com/ecommerce/blue-cart-api'){
        //     console.log(response.url , newUrl)
        // }
        return areUrlsEquivalent(response.url , newUrl);
    } catch (error) {
        console.error(`Error fetching URL: ${oldUrl}`, error);
        return false;
    }
}

// Function to process each row of the CSV
async function processRow(row) {
    let oldUrl = row['Old URL'] || row['Old URL '];
    let newUrl = row['New URL '] || row['New URL'];
    let notes = row['Notes'] || row['Notes '];

    if (!oldUrl || !newUrl || notes === 'Not a direct domain change' || notes === 'Not a direct domain replast') {
        // console.error('Missing URLs in row:', row);
        return null;
    }
    
    const redirectCorrect = await checkRedirect(oldUrl, newUrl);
    return { oldUrl, newUrl, redirectCorrect };
}

// Function to process the uploaded CSV file
async function processCsvFile(filePath) {
    const results = [];
    const rowProcessingPromises = [];

    return new Promise((resolve, reject) => {
        createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                const rowProcessing = processRow(row)
                    .then(result => {
                        if (result) {
                            results.push(result);
                        }
                    })
                    .catch(error => console.error('Error processing row:', error));

                rowProcessingPromises.push(rowProcessing);
            })
            .on('end', async () => {
                // Wait for all row processing promises to resolve
                await Promise.all(rowProcessingPromises);
                resolve(results);
            })
            .on('error', reject);
    });
}

// POST route to handle the file upload and processing
app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = path.join(__dirname, req.file.path);

    try {
        const results = await processCsvFile(filePath);
        await fs.unlink(filePath); // Remove the uploaded file after processing
        res.json(results);
    } catch (error) {
        console.error('Error processing CSV file:', error);
        res.status(500).json({ error: 'Error processing file' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});