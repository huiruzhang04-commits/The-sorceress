import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const API_KEY = 'ms-5ebd3ae5-b2e7-4186-ab2f-3cf21c6cd1c2';
const BASE_URL = 'api-inference.modelscope.cn';

function httpsPost(urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(`https://${BASE_URL}${urlPath}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
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
    const url = new URL(`https://${BASE_URL}${urlPath}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
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
  console.log(`Generating: ${prompt.substring(0, 50)}...`);
  
  // Submit async task
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
  
  console.log('Submit result:', JSON.stringify(submitResult, null, 2));
  
  const taskId = submitResult.task_id || submitResult.output?.task_id;
  if (!taskId) {
    console.error('No task_id received');
    return false;
  }
  
  console.log(`Task submitted (ID: ${taskId}), polling...`);
  
  // Poll for result
  const pollHeaders = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'X-ModelScope-Task-Type': 'image_generation'
  };
  
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await httpsGet(`/v1/tasks/${taskId}`, pollHeaders);
    console.log(`Poll ${i}: status=${status.task_status}`);
    
    if (status.task_status === 'SUCCEED') {
      const imgUrl = status.output_images?.[0] || status.output?.results?.[0]?.url;
      if (!imgUrl) {
        console.error('No image URL in result');
        console.log('Result:', JSON.stringify(status, null, 2));
        return false;
      }
      console.log(`Downloading: ${imgUrl}`);
      await downloadFile(imgUrl, outputPath);
      console.log(`Saved: ${outputPath}`);
      return true;
    }
    if (status.task_status === 'FAILED') {
      console.error('Generation failed:', JSON.stringify(status, null, 2));
      return false;
    }
  }
  console.error('Timeout');
  return false;
}

// Get args
const prompt = process.argv[2];
const output = process.argv[3];
const size = process.argv[4] || '768x1024';

if (!prompt || !output) {
  console.log('Usage: node gen_image.mjs <prompt> <output_path> [size]');
  process.exit(1);
}

generateImage(prompt, output, size).then(ok => process.exit(ok ? 0 : 1));
