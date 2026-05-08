import React from 'react';

const statusMap = {
  idle:     { label: '📸  10초 현장 스캔 시작', sub: '버튼을 누르면 카메라가 바로 켜짐더' },
  uploading:{ label: '⏳  전송 중...',           sub: '잠깐만 기다려주이소' },
  done:     { label: '✅  전송 완료!',            sub: '다음 스캔을 시작하이소' },
  error:    { label: '❌  실패 — 다시 눌러보이소', sub: '네트워크를 확인해주이소' },
};

export default function ScanButton({ onClick, status, isBlocked }) {
  const { label, sub } = statusMap[status] || statusMap.idle;
  return (
    <button
      className={`scan-btn ${status === 'uploading' ? 'scan-btn--loading' : ''} ${isBlocked ? 'scan-btn--blocked' : ''}`}
      onClick={onClick}
      disabled={status === 'uploading'}
    >
      <span className="scan-btn__label">{isBlocked ? '🔒  구독 후 계속 스캔' : label}</span>
      <span className="scan-btn__sub">{isBlocked ? '월 9,900원 · 무제한' : sub}</span>
    </button>
  );
}
