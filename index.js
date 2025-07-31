// index.js
const express = require('express');
const multer = require('multer');
const fs = require('fs').promises; // Use promise-based fs for async operations
const path = require('path');
const { spawn } = require('child_process'); // For running pdftk
const nodemailer = require('nodemailer'); // For sending emails
const fetch = require('node-fetch'); // For potential future API calls, included for consistency
const archiver = require('archiver');

const app = express();
const upload = multer(); // For parsing form data (empty body for this case)
const PORT = process.env.PORT || 3000; // Docker exposes 3000

// Utility to build an FDF string from your form data & mapping
function buildFDF(data, mapping) {
    let fdf = `%FDF-1.2
1 0 obj
<< /FDF << /Fields [`;
    for (const [htmlField, pdfField] of Object.entries(mapping)) {
        let val = data[htmlField] || '';
        
        // Handle common checkbox values for pdftk (e.g., 'yes' -> 'Yes')
        if (typeof val === 'string' && val.toLowerCase() === 'yes') {
            val = 'Yes'; // Ensure proper capitalization for pdftk checkboxes
        }
        
        // Escape parentheses and backslashes for FDF string values
        const valEscaped = val.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        fdf += `<< /T (${pdfField}) /V (${valEscaped}) >> `;
    }
    fdf += `] >> >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`;
    return fdf;
}

// Health check endpoint (for Render or general status check)
app.get('/healthz', (req, res) => res.sendStatus(200));

app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Ensure uploads directory exists before server starts
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(err => {
    console.error("Failed to create uploads directory:", err);
});

app.post('/fill-multiple', upload.none(), async (req, res) => {
    
    let tempPaths = [];

    try {
        let segments = req.body.segments || ['society', 'bar125'];

        const formData = req.body.formData;
        if (!formData) {
            return res.status(400).json({ error: "Missing 'formData' in request" });
        }

        const expectedApiKey = process.env.PDF_FILL_SERVICE_API_KEY;
        const incomingApiKey = req.headers['x-api-key'];
        if (expectedApiKey && incomingApiKey !== expectedApiKey) {
            return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
        }

        const templateMap = {
            bar125: {
                pdf: 'BarAccord125.pdf',
                mapping: 'BarAccord125.json'
            },
            society: {
                pdf: 'SocietyMappedCorrected.pdf',
                mapping: 'SocietyMappedCorrected.json'
            }
        };

        const filledPdfs = [];

        for (const segment of segments) {
            const selected = templateMap[segment];
            if (!selected) {
                throw new Error(`Unknown segment: ${segment}`);
            }

            const mappingPath = path.join(__dirname, 'mapping', selected.mapping);
            const pdfTemplatePath = path.join(__dirname, 'forms', selected.pdf);

            let mapping;
            try {
                const mappingData = await fs.readFile(mappingPath, 'utf8');
                mapping = JSON.parse(mappingData);
            } catch (jsonError) {
                throw new Error(`Mapping file not found or invalid for segment: ${segment}`);
            }

            try {
                await fs.access(pdfTemplatePath, fs.constants.F_OK);
            } catch (fileError) {
                throw new Error(`PDF template not found: ${selected.pdf}`);
            }

            const fdf = buildFDF(formData, mapping);
            const now = Date.now();
            const fdfPath = path.join(__dirname, 'uploads', `${segment}-${now}.fdf`);
            const outPdfPath = path.join(__dirname, 'uploads', `${segment}-filled-${now}.pdf`);
            tempPaths.push(fdfPath, outPdfPath);

            await fs.writeFile(fdfPath, fdf, 'utf8');

            await new Promise((resolve, reject) => {
                const proc = spawn('pdftk', [
                    pdfTemplatePath,
                    'fill_form', fdfPath,
                    'output', outPdfPath,
                    'flatten'
                ]);

                let stderr = '';
                proc.stderr.on('data', (data) => { stderr += data.toString(); });

                proc.on('close', (code) => {
                    if (stderr) console.error(`PDFtk stderr:\n${stderr}`);

                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`pdftk failed with code ${code}. Stderr: ${stderr || 'None'}`));
                    }
                });
                proc.on('error', (err) => {
                    reject(new Error(`Failed to spawn pdftk: ${err.message}`));
                });
            });

            filledPdfs.push({ filename: `${segment}-application.pdf`, path: outPdfPath });
        }
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="filled-applications.zip"');
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
        for (const pdf of filledPdfs) {
            archive.file(pdf.path, { name: pdf.filename });
        }
        await archive.finalize();

    } catch (err) {
        console.error('Error in /fill-multiple endpoint:', err);
        return res.status(500).json({ error: err.message });
    } finally {
        for (const file of tempPaths) {
            fs.unlink(file).catch(() => {});
        }
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Node.js PDF service running on port ${PORT}`);
});