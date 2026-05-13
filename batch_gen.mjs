import https from 'https';
import fs from 'fs';

const API_KEY = 'ms-5ebd3ae5-b2e7-4186-ab2f-3cf21c6cd1c2';
const BASE_URL = 'api-inference.modelscope.cn';

const prompts = [
  { id: 10, prompt: "Japanese anime Cells at Work style, bright warm anime. White blood cells lining up in blood vessel playground. Big white blood cell is 9th from front (red mark), 6th from back (blue mark). He is circled with highlight, small hint 'counted twice, subtract 1'. Large text '9+6-1=14' above. Clean line bright flat color, 3:4 portrait, cute not childish", file: 'method_q10.png' },
  { id: 11, prompt: "Japanese anime Cells at Work style, bright warm anime. Platelet squad leader in cell shop, counter has 3 boxes of bandages priced 8 yuan each, holding 30 yuan bill. Top left bubble '8+8+8=24 yuan', bottom right '30-24=6 yuan change', 6 coins sparkling. Red blood cell shopkeeper smiling behind counter. Clean line bright flat color, 3:4 portrait, cute not childish", file: 'method_q11.png' },
  { id: 12, prompt: "Japanese anime Cells at Work style, bright warm anime. Macrophage aunt (elegant gentle white apron) and white blood cell cleaning bacteria together. Macrophage has 47 purple bacteria in front (two piles: 40+7), white blood cell has 36 (30+6). Center vertical addition '47+36=83', carry marked with red flag. Blood vessel cleaning scene, light pink background. Clean line bright flat color, 3:4 portrait, cute not childish", file: 'method_q12.png' },
  { id: 13, prompt: "Japanese anime Cells at Work style, bright warm anime. Blood vessel scene with 72 white blood cell characters split into two teams: 45 holding 'rest' sign walking left, 27 holding 'patrol' flag staying right. Center vertical subtraction '72-45=27', borrow marked blue. Red blood cells floating in distance. Clean line bright flat color, 3:4 portrait, cute not childish", file: 'method_q13.png' },
  { id: 14, prompt: "Japanese anime Cells at Work style, bright warm anime. Platelet squad leader (blue hat white apron) and B cell (big guy in white) standing side by side. Platelet has 58 purple virus balls in front, B cell has 34. Big equals sign between them, right side 24 viruses circled with '24 more caught!'. Platelet waving small flag proudly. Clean line bright flat color, 3:4 portrait, cute not childish", file: 'method_q14.png' },
  { id: 15, prompt: "Japanese anime Cells at Work style, bright warm anime. Red blood cell with backpack in bone marrow shop, big oxygen mask priced 35 yuan and small mask 8 yuan in front, holding 50 yuan. Two steps shown: top left bubble '35+8=43 yuan (total)', bottom large '50-43=7 yuan (left)', 7 coins in red blood cell's hand. Clean line bright flat color, 3:4 portrait, cute not childish", file: 'method_q15.png' },
  { id: 16, prompt: "Japanese anime Cells at Work style, bright warm anime. Platelet squad leader in bone marrow classroom looking at big wall clock - hour hand between 2 and 3, minute hand at 6. Timeline below: 2:30 → red arrow → 3:00, labeled '30 minutes left!'. Several red blood cells sitting in classroom waiting for meeting. Clock face clear and easy for children to read. Clean line bright flat color, 3:4 portrait, cute not childish", file: 'method_q16.png' }
];

function httpsPost(urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: BASE_URL,
      path: urlPath,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve(d); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(urlPath, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: urlPath,
      method: 'GET',
      headers
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve(d); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(outputPath, () => {}); reject(err); });
  });
}

async function generateImage(prompt, outputPath, size = '768x1024') {
  console.log(`\n[${outputPath}] Submitting...`);
  
  const submitResult = await httpsPost('/v1/images/generations', {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'X-ModelScope-Async-Mode': 'true'
  }, {
    model: 'Tongyi-MAI/Z-Image-Turbo',
    prompt,
    n: 1,
    size
  });
  
  const taskId = submitResult.task_id || submitResult.output?.task_id;
  if (!taskId) {
    console.error('No task_id');
    return false;
  }
  
  const pollHeaders = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'X-ModelScope-Task-Type': 'image_generation'
  };
  
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await httpsGet(`/v1/tasks/${taskId}`, pollHeaders);
    process.stdout.write('.');
    
    if (status.task_status === 'SUCCEED') {
      const imgUrl = status.output_images?.[0] || status.output?.results?.[0]?.url;
      if (!imgUrl) { console.error('No URL'); return false; }
      console.log(`\nDownloading...`);
      await downloadFile(imgUrl, outputPath);
      console.log(`Saved: ${outputPath}`);
      return true;
    }
    if (status.task_status === 'FAILED') {
      console.error('\nFailed:', JSON.stringify(status));
      return false;
    }
  }
  console.error('\nTimeout');
  return false;
}

// Generate all 7 images sequentially
async function main() {
  let success = 0, fail = 0;
  for (const item of prompts) {
    const ok = await generateImage(item.prompt, item.file);
    if (ok) success++; else fail++;
    await new Promise(r => setTimeout(r, 1000)); // Small delay between requests
  }
  console.log(`\n\nDone! Success: ${success}, Failed: ${fail}`);
}

main();
