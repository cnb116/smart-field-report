const MAKE_WEBHOOK_URL = import.meta.env.VITE_MAKE_UPLOAD_URL;
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function uploadToMake(file, meta = {}) {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('team', meta.team || '미확인');
  formData.append('timestamp', new Date().toISOString());
  formData.append('size', file.size);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`[업로드] ${attempt}차 실패 — 재시도 중...`);
      await sleep(2000 * attempt);
    }
  }
}
