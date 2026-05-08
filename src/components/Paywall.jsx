import React from 'react';

export default function Paywall({ onClose }) {
  return (
    <div className="paywall-overlay" onClick={onClose}>
      <div className="paywall-card" onClick={e => e.stopPropagation()}>
        <p className="paywall-emoji">🏗️</p>
        <h2 className="paywall-title">무료 체험 3회 완료!</h2>
        <p className="paywall-desc">현장 영상 분석을 무제한으로<br />사용하실 수 있심더</p>
        <div className="paywall-price">
          <span className="paywall-amount">9,900원</span>
          <span className="paywall-period">/ 월</span>
        </div>
        <button className="paywall-cta" onClick={() => alert('결제 연동 준비 중임더')}>
          💳  지금 바로 구독하기
        </button>
        <button className="paywall-close" onClick={onClose}>나중에 하겠심더</button>
      </div>
    </div>
  );
}
