import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, 
  Send, 
  CheckSquare, 
  Loader2,
  X
} from 'lucide-react';
import './index.css';

const APP_URL = "https://vercelponesons-projects.vercel.app";
const TITLE = "김반장 현장 보고";

const App = () => {
  const [memoText, setMemoText] = useState('');
  const [memos, setMemos] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentDate, setCurrentDate] = useState('');
  const [lastAIAnalysis, setLastAIAnalysis] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [reportContent, setReportContent] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 음성 인식 관련 (Web Speech API)
  const recognitionRef = useRef(null);
  const memoTextRef = useRef(memoText);

  useEffect(() => {
    memoTextRef.current = memoText;
  }, [memoText]);

  // [정식 결재판] AI 결과 겐타 (JSON 형식 데이터 추출)
  const turboProcessAI = async (text) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("🚨 VITE_GEMINI_API_KEY가 설정되지 않았습니다! .env 파일이나 Vercel 환경 변수를 확인해주세요.");
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
    
    const prompt = `역할: 베테랑 건설 현장 대리인
미션: 입력된 내용을 바탕으로 공식 '현장 공정 일보'의 4가지 핵심 항목을 정제하십시오.
지침: 말투는 '~ 완료', '~ 배치', '~ 이상 무' 등 짧고 명확한 현장 용어를 사용하십시오.

출력 형식: 반드시 아래와 같은 JSON 구조로만 출력하십시오. 코드 블록(\`\`\`) 없이 순수 JSON 텍스트만 출력하십시오.

{
  "날짜": "${today}",
  "공종": "공종명 및 작업 내용 요약",
  "인원": "투입 인원 및 장비 현황 요약",
  "특이사항": "안전 사항 및 특이사항 요약"
}

[입력 데이터]: ${text}`;

    try {
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }]
      });
      let result = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      // JSON 파싱 시도 (코드 블록 등이 있을 경우 정제)
      result = result.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(result);
      
      try { 
        const copyText = `날짜: ${parsed.날짜}\n공종: ${parsed.공종}\n인원: ${parsed.인원}\n특이사항: ${parsed.특이사항}`;
        if (navigator.clipboard) await navigator.clipboard.writeText(copyText); 
      } catch (e) {}
      
      return parsed;
    } catch (e) {
      console.error("AI 분석 오류:", e);
      return null;
    }
  };

  useEffect(() => {
    // [화면 유지] 현장 필사 중 화면 꺼짐 방지 (Wakelock API)
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn(`${err.name}, ${err.message}`);
      }
    };
    requestWakeLock();

    // 로컬 스토리지 데이터 로드 (네트워크 불안정 대비)
    const saved = localStorage.getItem('kimbanjang_memos');
    if (saved) setMemos(JSON.parse(saved));

    const updateDate = () => {
      const now = new Date();
      const options = { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' };
      setCurrentDate(now.toLocaleDateString('ko-KR', options).replace(/\. /g, '. '));
    };
    updateDate();

    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      // [중복 방지] continuous=false로 설정하여 안드로이드 중복 루프 차단
      recognition.continuous = false; 
      recognition.interimResults = true;
      recognition.lang = 'ko-KR';

      recognition.onresult = (event) => {
        const results = event.results;
        const lastResult = results[results.length - 1];
        
        if (lastResult.isFinal) {
          const transcript = lastResult[0].transcript.trim();
          // 기존 텍스트랑 끝부분이 겹치면 중복 방지 처리
          setMemoText(prev => {
            if (prev.trim().endsWith(transcript)) return prev;
            return prev + (prev.length > 0 ? ' ' : '') + transcript;
          });
        }
      };

      recognition.onend = () => {
        // 에러나 자발적 종료 시 state와 맞춤 처리
        setIsListening(false);
      };

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

  const showError = (msg) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 3000);
  };

  const handleSendMemo = async () => {
    if (!memoText.trim()) return;
    setIsSending(true);

    try {
      // 1. 데이터 시트 전송 (Make Webhook - 원본 데이터 직접 발송)
      const webhookUrl = import.meta.env.VITE_MAKE_REPORT_WEBHOOK_URL;
      if (!webhookUrl) {
        console.error("🚨 VITE_MAKE_REPORT_WEBHOOK_URL이 설정되지 않았습니다!");
      }
      
      const payload = {
        id: Date.now(),
        raw_content: memoText,      // 원본 음성/텍스트 입고
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      };

      console.log("🚀 구글 시트 배선 전송 시작:", payload);

      let finalReportData = null;

      if (webhookUrl) {
        const response = await axios.post(webhookUrl, payload, { 
          timeout: 15000,
          headers: { 'Content-Type': 'application/json' }
        });
        console.log("✅ 구글 시트 배선 전송 성공:", response.data);
        
        // Make.com 응답 안의 result 반영 (없으면 전체 반영)
        if (response.data && response.data.result) {
          finalReportData = response.data.result;
        } else if (response.data) {
          finalReportData = response.data;
        }
      }

      setReportContent(finalReportData);

      const newMemo = {
        id: Date.now(),
        text: memoText,
        make_response: finalReportData,
        time: payload.time
      };

      const updatedMemos = [newMemo, ...memos];
      setMemos(updatedMemos);
      localStorage.setItem('kimbanjang_memos', JSON.stringify(updatedMemos));
      setMemoText('');

      // [팝업 겐타] 중앙 분석 결과 모달 띄우기
      setShowAIPanel(true);

      // [간병 모드 알림] 앱에 메시지 전송
      if (window.Kimbanjang) {
        window.Kimbanjang.postMessage('care_alert');
      }
    } catch (e) {
      console.error(e);
      showError('전송 중 오류가 발생했습니더. 다시 시도하이소.');
    } finally {
      setIsSending(false);
    }
  };

  const renderReportTable = (aiData) => {
    if (!aiData) return null;

    // 만약 데이터가 객체인데 특정 키(날짜)가 없다면 문자열로 변환 (Make.com Raw 응답 대비)
    let displayData = aiData;
    if (typeof displayData === 'object' && !displayData.날짜 && !displayData.공종) {
      displayData = displayData.text || displayData.content || JSON.stringify(displayData, null, 2);
    }

    if (typeof displayData === 'string') {
      return (
        <div className="report-paper-container">
          <div className="report-paper-header">
            <div className="report-no">No. {new Date().toISOString().slice(0, 10)}-01</div>
            <div className="report-stamp-area">
              <div className="stamp-box">
                <span className="stamp-label">확인</span>
                <div className="stamp-circle">承 認</div>
              </div>
            </div>
          </div>
          <h1 className="report-main-title">현 장 공 정 일 보</h1>
          <div style={{ padding: '20px', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '1.1rem', textAlign: 'left', fontWeight: '500', color: '#333' }}>
            {displayData}
          </div>
          <div className="report-footer-sign">
            <p>위와 같이 오늘의 공정 내용을 보고함.</p>
            <p className="footer-date">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p className="footer-rep">현장대리인 귀하</p>
          </div>
        </div>
      );
    }

    if (typeof displayData !== 'object') return null;

    const entries = [
      { key: '날짜', val: displayData.날짜 },
      { key: '공종', val: displayData.공종 },
      { key: '인원', val: displayData.인원 },
      { key: '특이사항', val: displayData.특이사항 }
    ];

    return (
      <div className="report-paper-container">
        <div className="report-paper-header">
          <div className="report-no">No. {new Date().toISOString().slice(0, 10)}-01</div>
          <div className="report-stamp-area">
            <div className="stamp-box">
              <span className="stamp-label">확인</span>
              <div className="stamp-circle">承 認</div>
            </div>
          </div>
        </div>
        
        <h1 className="report-main-title">현 장 공 정 일 보</h1>
        
        <table className="report-grid-table">
          <tbody>
            {entries.map((row, idx) => (
              <tr key={idx}>
                <th className="grid-th">{row.key}</th>
                <td className="grid-td">{row.val}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="report-footer-sign">
          <p>위와 같이 오늘의 공정 내용을 보고함.</p>
          <p className="footer-date">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="footer-rep">현장대리인 귀하</p>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {errorMessage && <div className="toast-msg">{errorMessage}</div>}

      {/* ── 1. 상단 날짜 영역 (10% 높이 사수) ── */}
      <div className="date-header-industrial">
        <span className="industrial-date">{currentDate}</span>
      </div>

      {/* ── 2. 중앙 음성 입력창 (45% 높이 사수) ── */}
      <div className="memo-container-industrial">
        <textarea 
          className="memo-textarea-industrial"
          placeholder="현장 상황을 말해주이소..."
          value={memoText}
          onChange={(e) => setMemoText(e.target.value)}
        />
      </div>

      {/* ── 3. 메인 액션 버튼 (25% 높이 사수) ── */}
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

      {/* ── 팝업 겐타 (정식 결재판 모달) ── */}
      <AnimatePresence>
        {showAIPanel && reportContent && (
          <motion.div 
            className="modal-overlay" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => setShowAIPanel(false)}
          >
            <motion.div 
              className="modal-content report-paper-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="report-body-paper">
                {renderReportTable(reportContent)}
              </div>

              <button className="btn-confirm-safety-full" onClick={() => setShowAIPanel(false)}>
                단디 확인! (현장 복귀)
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
