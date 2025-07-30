// index.js
const express = require('express');
const multer = require('multer');
const fs = require('fs').promises; // Use promise-based fs for async operations
const path = require('path');
const { spawn } = require('child_process'); // For running pdftk
const fetch = require('node-fetch'); // For potential future API calls, included for consistency

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
        
        // --- NEW: Handle common checkbox values for pdftk (e.g., 'yes' -> 'Yes') ---
        if (typeof val === 'string' && val.toLowerCase() === 'yes') {
            val = 'Yes'; // Ensure proper capitalization for pdftk checkboxes
        }
        // --- END NEW ---

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

app.post('/fill-pdf', upload.none(), async (req, res) => {
    // Note: In Node.js, we don't have the same IndentationError as Python.
    // The problem with app.py was its content's invisible characters/encoding.
    // This Node.js code is functionally equivalent.

    // Initialize paths to null for cleanup in finally block
    let fdfPath = null;
    let outPdfPath = null;

    try {
        const segment = req.body.segment;
        const formData = req.body.formData;

        if (!formData || !segment) {
            return res.status(400).json({ error: "Missing 'formData' or 'segment' in request" });
        }

        // --- Basic API Key Authentication ---
        const expectedApiKey = process.env.PDF_FILL_SERVICE_API_KEY;
        const incomingApiKey = req.headers['x-api-key']; // Headers are usually lowercase in Node.js
        if (!expectedApiKey) {
            console.warn("Warning: PDF_FILL_SERVICE_API_KEY environment variable not set on the server!");
            // For local testing, you might allow if key is unset on server
            // In production, you'd likely reject if expectedApiKey is missing.
        }
        if (expectedApiKey && incomingApiKey !== expectedApiKey) {
            return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
        }

        // --- User's proposed Fix Option 2 for dynamic file naming ---
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

const selected = templateMap[segment];
if (!selected) {
    return res.status(400).json({ error: `Unknown segment: ${segment}` });
}

// Use selected.mapping and selected.pdf for paths
const mappingPath = path.join(__dirname, 'mapping', selected.mapping);
const pdfTemplatePath = path.join(__dirname, 'forms', selected.pdf);
// --- END User's Fix Option 2 ---

// Load mapping JSON
    let mapping = null; // <--- ADD THIS LINE (Declare 'mapping' here and initialize)
    try {
        const mappingData = await fs.readFile(mappingPath, 'utf8');
        mapping = JSON.parse(mappingData);
    } catch (jsonError) {
        console.error(`Error loading or parsing mapping file for segment ${segment} at ${mappingPath}:`, jsonError);
        return res.status(404).json({ error: `Mapping file not found or invalid for segment: ${segment}` });
    }
        // Verify PDF template exists
        try {
            await fs.access(pdfTemplatePath, fs.constants.F_OK); // Check if file exists
        } catch (fileError) {
            console.error(`PDF template not found: ${pdfTemplatePath}`, fileError);
            return res.status(404).json({ error: `PDF template not found: ${templateName}` });
        }

        // Generate FDF
        const fdf = buildFDF(formData, mapping);
        fdfPath = path.join(__dirname, 'uploads', `${segment}-${Date.now()}.fdf`); // Use 'uploads' as temp dir
        outPdfPath = path.join(__dirname, 'uploads', `${segment}-filled-${Date.now()}.pdf`);

        await fs.writeFile(fdfPath, fdf, 'utf8');

        // Shell out to pdftk to fill & flatten
        await new Promise((resolve, reject) => {
            const proc = spawn('pdftk', [
                pdfTemplatePath,
                'fill_form', fdfPath,
                'output', outPdfPath,
                'flatten'
            ]);

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                if (stdout) console.log(`PDFtk stdout:\n${stdout}`);
                if (stderr) console.error(`PDFtk stderr:\n${stderr}`);

                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`pdftk failed with code ${code}. Stderr: ${stderr || 'None'}`));
                }
            });
            proc.on('error', (err) => {
                console.error('pdftk spawn error:', err);
                reject(new Error(`Failed to spawn pdftk: ${err.message}`));
            });
        });

        // Read the filled PDF
        const pdfBuffer = await fs.readFile(outPdfPath);

        // Send the filled PDF as response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${segment}-application.pdf"`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error('Error in /fill-pdf endpoint:', err);
        // Handle specific errors for better response
        if (err.message.includes('pdftk failed') || err.message.includes('Failed to spawn pdftk')) {
            return res.status(500).json({ error: 'PDF processing failed', details: err.message });
        }
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    } finally {
        // Clean up temporary files (asynchronously, no need to await)
        if (fdfPath) {
            fs.unlink(fdfPath).catch(err => console.error(`Error deleting temp FDF file ${fdfPath}:`, err));
        }
        if (outPdfPath) {
            fs.unlink(outPdfPath).catch(err => console.error(`Error deleting temp PDF file ${outPdfPath}:`, err));
        }
    }
});
// Ensure uploads folder exists before the server starts
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(err => {
  console.error("Failed to create uploads directory:", err);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Node.js PDF service running on port ${PORT}`);
});
