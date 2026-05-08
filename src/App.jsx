import React, { useState, useRef } from 'react';
import ScanButton from './components/ScanButton';
import Paywall from './components/Paywall';
import './index.css';

const FREE_LIMIT = 3;
const STORAGE_KEY = 'jajae_scan_count';

export default function App() {
  const [scanCount, setScanCount] = useState(() => {
    return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  });
  const [showPaywall, setShowPaywall] = useState(false);
  const [status, setStatus] = useState('idle');
  const fileInputRef = useRef(null);
  const isBlocked = scanCount >= FREE_LIMIT;

  const handleScanClick = () => {
    if (isBlocked) { setShowPaywall(true); return; }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newCount = scanCount + 1;
    setScanCount(newCount);
    localStorage.setItem(STORAGE_KEY, String(newCount));
    setStatus('uploading');
    e.target.value = '';
    try {
      const { uploadToMake } = await import('./utils/uploadFile');
      await uploadToMake(file, { team: '현장반' });
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="app-shell">
      <div className="scan-counter">
        {isBlocked ? '🔒 무료 체험 종료' : `무료 스캔 ${FREE_LIMIT - scanCount}회 남음`}
      </div>
      <ScanButton onClick={handleScanClick} status={status} isBlocked={isBlocked} />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
      <a href="#" className="back-btn">← 메인으로</a>
    </div>
  );
}