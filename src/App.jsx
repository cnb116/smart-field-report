import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, X } from 'lucide-react';
import './index.css';

// ════════════════════════════════════════════════════
//  배선 정보 — .env / Vercel 변수명과 1:1 일치
//  1공정: VITE_MAKE_MEMO_URL   → 구글 시트 저장
//  2공정: VITE_MAKE_REPORT_URL → Gemini 리포트 생성
// ════════════════════════════════════════════════════
const MEMO_URL   = import.meta.env.VITE_MAKE_MEMO_URL;
const REPORT_URL = import.meta.env.VITE_MAKE_REPORT_URL;

// ════════════════════════════════════════════════════
//  음성 오타 자동 교정 — 현장 수칙
// ════════════════════════════════════════════════════
const TYPO_MAP = [
  [/5분\s*게이트/g,                   '5번 게이트'],
  [/오봉리에이터/g,                    '5번 게이트'],
  [/오봉\s*게이트/g,                  '5번 게이트'],
  [/제\s*(\d+)\s*호\s*게이트?/g,      (_, n) => `${n}번 게이트`],
  [/제\s*일\s*호/g,                   '1번 게이트'],
  [/제\s*이\s*호/g,                   '2번 게이트'],
  [/제\s*삼\s*호/g,                   '3번 게이트'],
  [/제\s*사\s*호/g,                   '4번 게이트'],
  [/제\s*오\s*호/g,                   '5번 게이트'],
  [/제\s*육\s*호/g,                   '6번 게이트'],
  [/제\s*칠\s*호/g,                   '7번 게이트'],
  [/제\s*팔\s*호/g,                   '8번 게이트'],
  [/제\s*구\s*호/g,                   '9번 게이트'],
  [/컹크리트|콘트리트/g,               '콘크리트'],
  [/레미관차/g,                        '레미콘차'],
  [/비게(?!계)/g,                      '비계'],
  [/거프집/g,                          '거푸집'],
  [/체근/g,                            '철근'],
];

function correctTypos(text) {
  let out = text;
  for (const [pattern, replacement] of TYPO_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// ════════════════════════════════════════════════════
//  normalizeReport — 어떤 JSON 구조가 와도 안전하게 파싱
//  A) { process:[...], safety:[...] }  (영문 키)
//  B) { 공정:[...], 안전:[...] }        (한글 키)
//  C) { process:"항목1\n항목2" }        (문자열)
//  D) { report:{ ... } }              (중첩)
//  E) [{ ... }]                       (배열)
// ════════════════════════════════════════════════════
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') return val.split(/\n|,|•|ㆍ/).map(s => s.trim()).filter(Boolean);
  if (typeof val === 'object') return Object.values(val).map(String).filter(Boolean);
  return [String(val)];
}

function normalizeReport(raw) {
  if (!raw) return null;
  // E) 배열이면 첫 번째 요소
  if (Array.isArray(raw)) raw = raw[0] ?? {};
  // D) 중첩 report 키
  if (raw.report && typeof raw.report === 'object') raw = raw.report;
  // D-2) 중첩 result 키 (Make.com 응답 패턴)
  if (raw.result && typeof raw.result === 'object') raw = raw.result;

  const date    = raw.date    ?? raw['일자'] ?? raw['날짜'] ?? '';
  const weather = raw.weather ?? raw['날씨'] ?? '';
  const process = toArray(raw.process ?? raw['공정'] ?? raw.work  ?? raw['작업']);
  const safety  = toArray(raw.safety  ?? raw['안전'] ?? raw.safetyIssue ?? raw['안전사항']);
  const special = toArray(raw.special ?? raw['특기'] ?? raw.note  ?? raw['기타']);
  const summary = raw.summary ?? raw['요약'] ?? raw['종합'] ?? '';

  return { date, weather, process, safety, special, summary };
}

// ════════════════════════════════════════════════════
//  카카오톡 복사용 텍스트 포맷터
// ════════════════════════════════════════════════════
function toKakaoText(report, currentDate) {
  const dateStr = report.date || currentDate || new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
  const lines = [
    '📋 스마트 현장 일보',
    `📅 ${dateStr}`,
    '─────────────────────',
  ];
  if (report.weather) lines.push(`🌤 날씨: ${report.weather}`);
  if (report.process?.length) { lines.push('', '🔧 [공정]'); report.process.forEach(i => lines.push(`ㆍ${i}`)); }
  if (report.safety?.length)  { lines.push('', '⛑️ [안전]'); report.safety.forEach(i  => lines.push(`ㆍ${i}`)); }
  if (report.special?.length) { lines.push('', '📌 [특기]'); report.special.forEach(i => lines.push(`ㆍ${i}`)); }
  if (report.summary)         { lines.push('', '─────────────────────', `📝 ${report.summary}`); }
  return lines.join('\n');
}

// ════════════════════════════════════════════════════
//  하위 컴포넌트
// ════════════════════════════════════════════════════
function ReportSection({ color, emoji, title, items }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ margin: '0 0 5px', fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
        {emoji} {title}
      </p>
      {items.map((item, i) => (
        <p key={i} style={{ margin: '3px 0', fontSize: 14, lineHeight: 1.65, color: '#333333', paddingLeft: 6 }}>
          ㆍ{item}
        </p>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════
//  메인 앱
// ════════════════════════════════════════════════════
const App = () => {
  const [memoText, setMemoText]       = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending]     = useState(false);
  const [currentDate, setCurrentDate] = useState('');

  // 공정별 상태 토스트
  const [toastMsg, setToastMsg]   = useState('');

  // 리포트
  const [report, setReport]         = useState(null);   // normalizeReport() 결과
  const [showModal, setShowModal]   = useState(false);
  const [sheetError, setSheetError] = useState(false);
  const [copied, setCopied]         = useState(false);

  const recognitionRef = useRef(null);
  const memoTextRef    = useRef(memoText);

  useEffect(() => { memoTextRef.current = memoText; }, [memoText]);

  // ── 날짜 + WakeLock + 음성 인식 초기화 ──────────
  useEffect(() => {
    // 화면 켜짐 유지
    (async () => {
      try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); }
      catch (e) { console.warn(e.message); }
    })();

    // 오늘 날짜
    setCurrentDate(new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).replace(/\. /g, '. '));

    // 음성 인식
    if ('webkitSpeechRecognition' in window) {
      const SR = window.webkitSpeechRecognition;
      const r  = new SR();
      r.continuous      = false;
      r.interimResults  = true;
      r.lang            = 'ko-KR';
      r.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        if (last.isFinal) {
          const fixed = correctTypos(last[0].transcript.trim());
          setMemoText(prev => prev ? prev + ' ' + fixed : fixed);
        }
      };
      r.onend = () => setIsListening(false);
      recognitionRef.current = r;
    }
  }, []);

  const toggleListening = useCallback(() => {
    try {
      if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }
      else             { recognitionRef.current?.start(); setIsListening(true); }
    } catch (e) {
      console.error('음성 인식 오류:', e);
      setIsListening(false);
    }
  }, [isListening]);

  // ════════════════════════════════════════════════
  //  단디 전송 — 1공정 → 2공정 순차 실행
  // ════════════════════════════════════════════════
  const handleSendMemo = useCallback(async () => {
    const text = memoText.trim();
    if (!text) return;

    if (!MEMO_URL || !REPORT_URL) {
      setToastMsg('🚨 Webhook 주소 미설정 — Vercel 환경변수 확인 요망');
      return;
    }

    setIsSending(true);
    setSheetError(false);
    setToastMsg('');

    const payload = {
      id:          Date.now(),
      text,
      raw_content: text,
      timestamp:   new Date().toISOString(),
      time:        new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };

    // ── 1공정: 구글 시트 저장 ──────────────────────
    setToastMsg('📋 1공정: 시트 저장 중...');
    try {
      const r1 = await fetch(MEMO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });
      if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
      setToastMsg('✅ 시트 저장 완료! 리포트 생성 중...');
    } catch (err) {
      console.error('🚨 1공정 실패:', err);
      setSheetError(true);
      setToastMsg('⚠️ 시트 저장 실패 — 리포트는 계속 진행합니다...');
    }

    // ── 2공정: 리포트 생성 ─────────────────────────
    setToastMsg('📝 2공정: 리포트 생성 중... (최대 2분 소요)');
    try {
      const r2 = await fetch(REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });
      if (!r2.ok) throw new Error(`HTTP ${r2.status}`);

      const raw = await r2.json();
      console.log('[2공정] 원본:', raw);

      const normalized = normalizeReport(raw);
      console.log('[2공정] 정규화:', normalized);

      setReport(normalized);
      setToastMsg('');
      setMemoText('');
      setShowModal(true);
    } catch (err) {
      console.error('🚨 2공정 실패:', err);
      setToastMsg(`❌ 리포트 생성 실패: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  }, [memoText]);

  // ── 카카오톡 복사 ────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(toKakaoText(report, currentDate));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('복사 오류:', e);
    }
  }, [report, currentDate]);

  // ════════════════════════════════════════════════
  //  렌더
  // ════════════════════════════════════════════════
  return (
    <div className="app-container">

      {/* ── 토스트 메시지 ── */}
      {toastMsg && <div className="toast-msg">{toastMsg}</div>}

      {/* ── 날짜 헤더 ── */}
      <div className="date-header-industrial">
        <span className="industrial-date">{currentDate}</span>
      </div>

      {/* ── 음성 입력창 ── */}
      <div className="memo-container-industrial">
        <textarea
          className="memo-textarea-industrial"
          placeholder="현장 상황을 말해주이소..."
          value={memoText}
          onChange={e => setMemoText(correctTypos(e.target.value))}
        />
      </div>

      {/* ── 액션 버튼 ── */}
      <div className="action-row-industrial">
        <button
          className={`btn-mic-industrial ${isListening ? 'listening' : ''}`}
          onClick={toggleListening}
        >
          <Mic size={40} />
        </button>
        <button
          className="btn-send-industrial-orange"
          onClick={handleSendMemo}
          disabled={!memoText.trim() || isSending}
        >
          {isSending ? <Loader2 className="animate-spin" size={32} /> : '단디 전송'}
        </button>
      </div>

      {/* ════ 리포트 팝업 모달 ════ */}
      <AnimatePresence>
        {showModal && report && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.82)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 999999, padding: '0 8px',
            }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{    scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff',
                color: '#333333',
                borderRadius: 14,
                width: '100%',
                maxWidth: 520,
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
                overflow: 'hidden',
                fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
              }}
            >
              {/* 모달 헤더 */}
              <div style={{
                background: '#2c2c2e', padding: '14px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0,
              }}>
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>📋 현장 보고서</span>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <X size={22} />
                </button>
              </div>

              {/* 모달 본문 */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px 0', color: '#333333', fontSize: 14 }}>

                {/* 일자 행 */}
                <p style={{
                  margin: '0 0 6px', fontSize: 15, fontWeight: 900,
                  color: '#333333', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  📅 {report.date || currentDate}
                  {report.weather ? `　🌤 ${report.weather}` : ''}
                </p>
                <hr style={{ border: 'none', borderTop: '2px solid #e0e0e0', margin: '8px 0 14px' }} />

                {/* 공정 */}
                <ReportSection
                  color="#1a73e8" emoji="🔧" title="공정"
                  items={report.process?.length ? report.process : ['(공정 내용 없음)']}
                />
                {/* 안전 */}
                <ReportSection
                  color="#e53935" emoji="⛑️" title="안전"
                  items={report.safety?.length ? report.safety : ['(안전 사항 없음)']}
                />
                {/* 특기 */}
                {report.special?.length > 0 && (
                  <ReportSection color="#f57c00" emoji="📌" title="특기" items={report.special} />
                )}
                {/* 요약 */}
                {report.summary && (
                  <p style={{
                    margin: '10px 0 0', padding: '8px 12px',
                    background: '#f0f4ff', borderRadius: 8,
                    fontSize: 13, color: '#333333', lineHeight: 1.6,
                    borderLeft: '3px solid #1a73e8',
                  }}>
                    {report.summary}
                  </p>
                )}

                {/* 하단 버튼 영역 */}
                <div style={{ marginTop: 20, paddingBottom: 14 }}>
                  {sheetError && (
                    <p style={{ textAlign: 'center', color: '#E87A30', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                      ⚠️ 1공정 시트 저장 실패 — 관리자 문의
                    </p>
                  )}
                  <button
                    onClick={handleCopy}
                    style={{
                      width: '100%', padding: 14,
                      borderRadius: 10,
                      background: copied ? '#34a853' : '#E87A30',
                      color: '#fff', fontSize: '1.1rem', fontWeight: 700,
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'background 0.2s',
                    }}
                  >
                    {copied ? '✅ 복사됨!' : '📋 카톡 복사'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
