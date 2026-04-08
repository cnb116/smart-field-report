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
          timeout: 40000,
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
      
      // ✅ 나중에 이력을 볼 수 있게 로컬 스토리지에 날짜별로 저장하는 로직 추가
      try {
        const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
        const existingReportsStr = localStorage.getItem('kimbanjang_daily_reports') || '[]';
        const existingReports = JSON.parse(existingReportsStr);
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

      setMemoText('');

      // [팝업 겐타] 중앙 분석 결과 모달 띄우기
      setShowAIPanel(true);

      // [간병 모드 알림] 앱에 메시지 전송
      if (window.Kimbanjang) {
        window.Kimbanjang.postMessage('care_alert');
      }
    } catch (e) {
      console.error("Webhook Error Details:", e.response?.data || e.message || e);
      const serverStatus = e.response ? e.response.status : '네트워크 끊김 또는 CORS';
      const errorData = e.response?.data ? (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data)) : e.message;
      
      const errorText = `🚨 Make.com 전송 실패 🚨

상태 코드: ${serverStatus}
상세 에러: ${errorData}

* 브라우저 콘솔(F12)을 확인하시거나, Make.com 시나리오의 붉은색 에러 로그(History)를 점검해주세요. 특히 구글 시트 모듈 등에서 변수 매핑 문제가 없는지 확인 바랍니다.`;

      setReportContent(errorText);
      setShowAIPanel(true);
    } finally {
      setIsSending(false);
    }
  };

  // 잡내(URL, 마크다운 별표 등) 제거용 헬퍼 함수
  const cleanAiText = (val) => {
    if (typeof val !== 'string') return val;
    return val.replace(/https?:\/\/[^\s]+/g, '').replace(/\*\*/g, '').trim();
  };

  const formatReportContentForCopy = (data) => {
    if (!data) return '';
    if (typeof data === 'string') return cleanAiText(data);
    return `[현 장 공 정 일 보]\n날짜: ${cleanAiText(data.날짜) || ''}\n공종: ${cleanAiText(data.공종) || ''}\n인원: ${cleanAiText(data.인원) || ''}\n특이사항: ${cleanAiText(data.특이사항) || ''}`;
  };

  const handleCopy = async () => {
    try {
      const text = formatReportContentForCopy(reportContent);
      await navigator.clipboard.writeText(text);
      setErrorMessage('✅ 복사 완료!'); // toast ui 활용
    } catch (err) {
      console.error('복사 오류:', err);
      setErrorMessage('❌ 복사에 실패했습니다.');
    }
  };

  const handleShare = async () => {
    try {
      const text = formatReportContentForCopy(reportContent);
      if (navigator.share) {
        await navigator.share({
          title: '현장 공정 일보',
          text: text
        });
      } else {
        await navigator.clipboard.writeText(text);
        setErrorMessage('공유 기능을 지원하지 않는 기기입니다. (자동 복사됨)');
      }
    } catch (err) {
      console.error('공유 중단/오류:', err);
    }
  };

  const renderReportTable = (aiData) => {
    if (!aiData) return null;

    let displayData = aiData;
    if (typeof displayData === 'object' && !displayData.날짜 && !displayData.공종) {
      displayData = displayData.text || displayData.content || JSON.stringify(displayData, null, 2);
    }

    if (typeof displayData === 'string') {
      return (
        <div style={{ padding: '10px', fontSize: '1.8rem', fontWeight: '900', color: '#000', lineHeight: '1.5', wordBreak: 'keep-all', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
          {cleanAiText(displayData)}
        </div>
      );
    }

    if (typeof displayData !== 'object') return null;

    const entries = [
      { key: '날짜', val: cleanAiText(displayData.날짜) },
      { key: '공종', val: cleanAiText(displayData.공종) },
      { key: '인원', val: cleanAiText(displayData.인원) },
      { key: '특이사항', val: cleanAiText(displayData.특이사항) }
    ];

    return (
      <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '25px' }}>
        {entries.map((row, idx) => {
          if (!row.val) return null;
          return (
            <div key={idx} style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '1.2rem', color: '#007AFF', fontWeight: 'bold', marginBottom: '8px' }}>[{row.key}]</div>
              <div style={{ fontSize: '2.0rem', fontWeight: '900', color: '#000', lineHeight: '1.4', wordBreak: 'keep-all', letterSpacing: '-0.5px' }}>
                {row.val}
              </div>
            </div>
          );
        })}
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
              className="modal-content"
              style={{ background: '#fff', padding: '30px 20px', borderRadius: '20px', width: '90%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 우측 상단 닫기 X 아이콘 */}
              <button 
                onClick={() => setShowAIPanel(false)}
                style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer' }}
              >
                <X size={32} />
              </button>

              <div style={{ marginTop: '20px' }}>
                {renderReportTable(reportContent)}
              </div>

              <div style={{ marginTop: '30px' }}>
                <button 
                  style={{ width: '100%', padding: '20px', borderRadius: '15px', background: '#FF5A00', color: '#fff', fontSize: '1.8rem', fontWeight: '900', border: 'none', cursor: 'pointer', boxShadow: '0 8px 20px rgba(255, 90, 0, 0.3)' }} 
                  onClick={handleCopy}
                >
                  내용 복사하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
