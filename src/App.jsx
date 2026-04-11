import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, 
  Loader2,
  X
} from 'lucide-react';
import './index.css';

const APP_URL = "https://smart-field-report.vercel.app";
const TITLE = "김반장 현장 보고";

const App = () => {
  const [memoText, setMemoText] = useState('');
  const [memos, setMemos] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentDate, setCurrentDate] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [reportContent, setReportContent] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [sheetError, setSheetError] = useState(false);

  const recognitionRef = useRef(null);
  const memoTextRef = useRef(memoText);

  useEffect(() => {
    memoTextRef.current = memoText;
  }, [memoText]);

  // ══════════════════════════════════════════════════════
  // [AI 두뇌] Gemini 프롬프트 — 오타 교정 특명 보강판
  // ══════════════════════════════════════════════════════
  const turboProcessAI = async (text) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("🚨 VITE_GEMINI_API_KEY 미설정! Vercel 환경변수를 확인하십시오.");
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const prompt = `역할: 대기업 건설 현장 전문 공정 관리관
미션: 투박한 현장 메모를 [전문가가 작성한 고품격 공정 보고서]로 변환하십시오.

[출력 문체 지침]
- 절대 별표(**)를 쓰지 마십시오. (필사 방해)
- "~함", "~완료", "~확인됨" 등으로 끝나는 전문적이고 군더더기 없는 문체 사용.
- 웹주소(URL)는 절대로 결과물에 포함하지 마십시오.

[필수 음성 오타 자동교정 — 반드시 적용]
음성 인식 특성상 숫자+단위 조합이 엉뚱하게 들어올 수 있음. 아래 패턴을 현장 문맥에 맞춰 반드시 교정하십시오.

숫자/번호 오타 교정:
- '5분 게이트', '오분 게이트' → '5번 게이트'
- '3분 구역', '삼분 구역'    → '3번 구역'
- '5년이 더', '오년이더'     → '5호 라인' 또는 '5호 구역' (문맥 판단)
- '일 번', '2 번', '삼 번'  → '1번', '2번', '3번' (붙여쓰기)

장비/공정 오타 교정:
- '오봉리에이터', '오퍼레이터' 등 장비 관련 → 문맥상 가장 가까운 건설장비명으로 교정 (예: 오퍼레이터, 굴착기, 리프트 등)
- '컹크리트', '콘크리트', '콘트리트' → '콘크리트'
- '레미콘차', '레미관차'              → '레미콘차'
- '비게', '비계'의 혼용               → '비계'
- '거프집', '거푸집'의 혼용           → '거푸집'
- '철근', '체근', '철근봉'            → '철근'

기타:
- 명백히 이상한 조합(예: '항중기', '크래인', '굴착키')은 현장 문맥상 가장 자연스러운 단어로 교정.
- 교정 내용을 별도로 명시하지 말고, 교정된 내용으로 바로 출력하십시오.

출력 형식: 반드시 아래 JSON 구조로만 출력하십시오. 코드 블록(\`\`\`) 없이 순수 JSON 텍스트만 출력하십시오.

{
  "일자": "${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })}",
  "구역": "구역명 기재",
  "공정": "베테랑의 숨결이 느껴지는 전문 문구로 2~3줄 기재",
  "안전": "법적 점검 사항을 준수한 듯한 격식 있는 문구 기재",
  "특기": "특이사항 기재 (없으면 '금일 작업 중 특이사항 없음' 으로 기재)"
}

[입력 데이터]: ${text}`;

    try {
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }]
      });
      let result = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      result = result.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(result);
      
      try { 
        const copyText = `일자: ${parsed.일자}\n● 구역: ${parsed.구역}\n● 공정: ${parsed.공정}\n● 안전: ${parsed.안전}\n● 특기: ${parsed.특기}`;
        if (navigator.clipboard) await navigator.clipboard.writeText(copyText); 
      } catch (e) {}
      
      return parsed;
    } catch (e) {
      console.error("AI 분석 오류:", e);
      return null;
    }
  };

  useEffect(() => {
    // [화면 유지] 현장 필사 중 화면 꺼짐 방지
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn(`${err.name}, ${err.message}`);
      }
    };
    requestWakeLock();

    const saved = localStorage.getItem('kimbanjang_memos');
    if (saved) setMemos(JSON.parse(saved));

    const updateDate = () => {
      const now = new Date();
      setCurrentDate(now.toLocaleDateString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
      }).replace(/\. /g, '. '));
    };
    updateDate();

    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'ko-KR';

      recognition.onresult = (event) => {
        const results = event.results;
        const lastResult = results[results.length - 1];
        if (lastResult.isFinal) {
          const transcript = lastResult[0].transcript.trim();
          setMemoText(prev => {
            if (prev.trim().endsWith(transcript)) return prev;
            return prev + (prev.length > 0 ? ' ' : '') + transcript;
          });
        }
      };

      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    try {
      if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
      } else {
        recognitionRef.current?.start();
        setIsListening(true);
      }
    } catch (e) {
      console.error("음성 인식 제어 오류:", e);
      setIsListening(false);
    }
  };

  // ══════════════════════════════════════════════════════
  // [특명] 1공정·2공정 Webhook 완전 분리 배선 + 타임아웃 120s
  // ══════════════════════════════════════════════════════
  const handleSendMemo = async () => {
    if (!memoText.trim()) return;
    setIsSending(true);
    setSheetError(false);
    setErrorMessage('데이터 저장 중...');

    // ▶ 1공정: VITE_MAKE_MEMO_URL (구글 시트 저장 전용)
    const memoWebhookUrl = import.meta.env.VITE_MAKE_MEMO_URL;
    // ▶ 2공정: VITE_MAKE_REPORT_URL (AI 보고서 생성 전용)
    const reportWebhookUrl = import.meta.env.VITE_MAKE_REPORT_URL;

    if (!memoWebhookUrl || !reportWebhookUrl) {
      console.error("🚨 환경변수 미설정! VITE_MAKE_MEMO_URL / VITE_MAKE_REPORT_URL 을 .env에 등록하십시오.");
      setErrorMessage('🚨 Webhook 주소 미설정 — .env 확인 요망');
      setIsSending(false);
      return;
    }

    try {
      const payload = {
        id: Date.now(),
        text: memoText,
        raw_content: memoText,
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      };

      // ── 1공정: 구글 시트 저장 (타임아웃 120s로 상향) ──
      try {
        await axios.post(memoWebhookUrl, payload, { timeout: 120000 });
        console.log("✅ 1공정 (구글 시트) 성공");
      } catch (err) {
        console.error("🚨 1공정 실패:", err);
        setSheetError(true);
        // 1공정 실패해도 2공정은 계속 진행
      }

      // ── 2공정: AI 보고서 생성 (타임아웃 120s 유지) ──
      let finalReportData = null;
      try {
        const response = await axios.post(reportWebhookUrl, payload, { timeout: 120000 });
        finalReportData = response.data?.result || response.data;
        console.log("✅ 2공정 (리포트 생성) 성공");
      } catch (err) {
        console.error("🚨 2공정 실패:", err);
        throw new Error("리포트 생성 서버 응답 없음");
      }

      setReportContent(finalReportData);
      const newMemo = { id: Date.now(), text: memoText, make_response: finalReportData, time: payload.time };
      const updatedMemos = [newMemo, ...memos];
      setMemos(updatedMemos);
      localStorage.setItem('kimbanjang_memos', JSON.stringify(updatedMemos));

      try {
        const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
        const existingReports = JSON.parse(localStorage.getItem('kimbanjang_daily_reports') || '[]');
        existingReports.push({
          date: todayStr,
          timestamp: new Date().toISOString(),
          originalMemo: memoText,
          report: finalReportData
        });
        localStorage.setItem('kimbanjang_daily_reports', JSON.stringify(existingReports));
      } catch(err) {
        console.error('보고서 이력 저장 오류:', err);
      }

      setErrorMessage('');
      setMemoText('');
      setShowAIPanel(true);

      if (window.Kimbanjang) window.Kimbanjang.postMessage('care_alert');

    } catch (e) {
      console.error("Webhook Error:", e.response?.data || e.message || e);
      const serverStatus = e.response ? e.response.status : '네트워크 끊김 또는 CORS';
      const errorData = e.response?.data
        ? (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data))
        : e.message;

      setReportContent(`🚨 Make.com 전송 실패 🚨\n\n상태 코드: ${serverStatus}\n상세 에러: ${errorData}\n\n* F12 콘솔 또는 Make.com History의 붉은 에러 로그를 확인하십시오.`);
      setShowAIPanel(true);
    } finally {
      setIsSending(false);
    }
  };

  // ══════════════════════════════════════════════════════
  // 텍스트 정제 헬퍼
  // ══════════════════════════════════════════════════════
  const cleanAiText = (val) => {
    if (typeof val !== 'string') return val;
    let cleaned = val.replace(/https?:\/\/[^\s]+/g, '').replace(/\*\*/g, '').trim();
    cleaned = cleaned.replace(/^.*(일자|날짜|구역)\s*[:：\s].*$/gm, '');
    const dateRegex = /202\d\s*(?:년\s*(?:\d{1,2}\s*월\s*\d{1,2}\s*일?)?|[\-\.]\s*\d{1,2}[\-\.]\s*\d{1,2}[일\.]?)/g;
    cleaned = cleaned.replace(dateRegex, '');
    cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();
    return cleaned;
  };

  const formatReportContentForCopy = (data) => {
    if (!data) return '';
    let cleanedStr = typeof data === 'string' ? cleanAiText(data) : '';

    if (typeof data !== 'string') {
      const getVal = (val) => val ? cleanAiText(String(val)).trim() : '';
      cleanedStr = `공정:\n${getVal(data.공정)}\n\n안전:\n${getVal(data.안전)}\n\n● 특기: ${getVal(data.특기)}`;
    }

    const lines = cleanedStr.split('\n').map(l => l.trim()).filter(Boolean);
    let mergedLines = [];
    for (const line of lines) {
      const isNewParagraph = /^(●|-|\*|\d+\.|공정|안전|특기)/.test(line);
      if (isNewParagraph || mergedLines.length === 0) {
        mergedLines.push(line);
      } else {
        mergedLines[mergedLines.length - 1] += ' ' + line;
      }
    }
    cleanedStr = mergedLines.join('\n');
    cleanedStr = cleanedStr.replace(/^[●\-\*\s]*(공정|안전)\s*[:：]\s*/gm, '\n$1:\n');
    cleanedStr = cleanedStr.replace(/^[●\-\*\s]*(특기)\s*[:：]\s*/gm, '\n● 특기: ');
    return cleanedStr.replace(/\n{3,}/g, '\n\n').trim();
  };

  const handleCopy = async () => {
    try {
      const text = `일자: ${currentDate}\n\n` + formatReportContentForCopy(reportContent);
      await navigator.clipboard.writeText(text);
      setErrorMessage('✅ 복사 완료!');
    } catch (err) {
      console.error('복사 오류:', err);
      setErrorMessage('❌ 복사에 실패했습니다.');
    }
  };

  const handleShare = async () => {
    try {
      const text = formatReportContentForCopy(reportContent);
      if (navigator.share) {
        await navigator.share({ title: '현장 공정 일보', text });
      } else {
        await navigator.clipboard.writeText(text);
        setErrorMessage('공유 미지원 기기입니다. (자동 복사됨)');
      }
    } catch (err) {
      console.error('공유 오류:', err);
    }
  };

  // ══════════════════════════════════════════════════════
  // [UI 마감] 팝업 본문 렌더러 — 글자 14px + 수량 하이라이팅
  // ══════════════════════════════════════════════════════
  const renderReportTable = (aiData) => {
    if (!aiData) return null;
    const formattedText = formatReportContentForCopy(aiData);
    const lines = formattedText.split('\n').map(l => l.trim()).filter(Boolean);

    const highlightNumbers = (text) => {
      const regex = /(\d+(?:\.\d+)?\s*(?:명|인|대|개|팀|건|조|톤|kg|m|cm|mm|식|루베|헤베))/g;
      const parts = text.split(regex);
      return parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} style={{ fontWeight: '900', color: '#000' }}>{part}</strong>
          : part
      );
    };

    return (
      <div style={{ width: '100%', padding: '0 4px' }}>
        {lines.map((line, idx) => {
          const isHeader = line.startsWith('●') || line.startsWith('공정') || line.startsWith('안전');
          return (
            <div key={idx} style={{
              marginTop: isHeader && idx !== 0 ? '18px' : '4px',
              fontWeight: isHeader ? '900' : 'normal',
              paddingLeft: isHeader ? '0' : '10px',
              /* ── [UI 마감] 본문 글자 14px 고정 ── */
              fontSize: '14px',
              lineHeight: '1.55',
              whiteSpace: 'normal',
              wordBreak: 'keep-all',
              color: '#111',
            }}>
              {highlightNumbers(line)}
            </div>
          );
        })}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div className="app-container">
      {errorMessage && <div className="toast-msg">{errorMessage}</div>}

      {/* ── 1. 날짜 헤더 ── */}
      <div className="date-header-industrial">
        <span className="industrial-date">{currentDate}</span>
      </div>

      {/* ── 2. 음성 입력창 ── */}
      <div className="memo-container-industrial">
        <textarea
          className="memo-textarea-industrial"
          placeholder="현장 상황을 말해주이소..."
          value={memoText}
          onChange={(e) => setMemoText(e.target.value)}
        />
      </div>

      {/* ── 3. 액션 버튼 ── */}
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
          {isSending ? <Loader2 className="animate-spin" size={32} /> : "단디 전송"}
        </button>
      </div>

      {/* ── 팝업 겐타 (정식 결재판) ── */}
      <AnimatePresence>
        {showAIPanel && reportContent && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAIPanel(false)}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 999999,
              padding: '0 1%',
            }}
          >
            <motion.div
              className="modal-content"
              style={{
                background: '#FFFDF0',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '800px',
                padding: '0',
                margin: '0',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 15px 35px rgba(0,0,0,0.5)',
                overflow: 'hidden',
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div style={{
                background: '#3A3A3A', padding: '14px 20px',
                display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative',
                flexShrink: 0,
              }}>
                <span style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 'bold' }}>현장 보고서</span>
                <button
                  onClick={() => setShowAIPanel(false)}
                  style={{ position: 'absolute', right: '15px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <X size={24} />
                </button>
              </div>

              {/* 본문 스크롤 영역 */}
              <div style={{ padding: '12px 10px 0', overflowY: 'auto', flex: 1 }}>

                {/* [UI 마감] 일자 — 한 줄 강제 인라인 고정 */}
                <div style={{
                  fontSize: '16px',
                  fontWeight: '900',
                  color: '#111',
                  margin: '0 0 8px 0',
                  paddingLeft: '4px',
                  whiteSpace: 'nowrap',       /* ← 줄바꿈 절대 불가 */
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '1.3',
                }}>
                  일자: {currentDate}
                </div>

                <div style={{ borderBottom: '2px solid #222', marginBottom: '14px' }} />

                {renderReportTable(reportContent)}

                {/* 하단 버튼 영역 */}
                <div style={{ marginTop: '20px', paddingBottom: '12px' }}>
                  {sheetError && (
                    <div style={{ textAlign: 'center', color: '#E87A30', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                      ⚠️ 1공정 시트 저장 실패 — 관리자 문의
                    </div>
                  )}
                  <button
                    style={{
                      width: '100%', padding: '13px',
                      borderRadius: '10px', background: '#E87A30',
                      color: '#fff', fontSize: '1.15rem', fontWeight: 'bold',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}
                    onClick={handleCopy}
                  >
                    📋 복사하기
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
