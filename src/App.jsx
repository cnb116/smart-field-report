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

const APP_URL = "https://smart-field-report.vercel.app";
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
    
    const prompt = `역할: 대기업 건설 현장 전문 공정 관리관
미션: 투박한 메모를 [전문가가 작성한 고품격 공정 보고서]로 변환하십시오.

[출력 문체 지침]
- 절대 별표(**)를 쓰지 마십시오. (필사 방해)
- "~함", "~완료", "~확인됨" 등으로 끝나는 전문적인 군더더기 없는 문체 사용.
- 웹주소(URL)는 절대로 결과물에 포함하지 마십시오.

출력 형식: 반드시 아래와 같은 JSON 구조로만 출력하십시오. 코드 블록(\`\`\`) 없이 순수 JSON 텍스트만 출력하십시오.

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
      
      // JSON 파싱 시도 (코드 블록 등이 있을 경우 정제)
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
    // 마크다운 별표(**) 제거 및 http/https URL 제거 (정규표현식)
    return val.replace(/https?:\/\/[^\s]+/g, '').replace(/\*\*/g, '').trim();
  };

  const formatReportContentForCopy = (data) => {
    if (!data) return '';
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    
    if (typeof data === 'string') {
      return `일자: ${today}\n\n${cleanAiText(data)}`;
    }
    
    // 객체 데이터인 경우 순수 텍스트로 결합
    const entries = [
      `일자: ${today}`,
      data.구역 ? `구역: ${cleanAiText(data.구역)}` : '',
      data.공정 ? `공정: ${cleanAiText(data.공정)}` : '',
      data.안전 ? `안전: ${cleanAiText(data.안전)}` : '',
      data.특기 ? `특기: ${cleanAiText(data.특기)}` : ''
    ].filter(Boolean);
    
    return entries.join('\n');
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

    const formattedText = formatReportContentForCopy(aiData);

    return (
      <div style={{ 
        padding: '10px', 
        fontSize: '1.8rem', 
        fontWeight: '900', 
        color: '#000', 
        lineHeight: '1.6', 
        wordBreak: 'keep-all', 
        textAlign: 'left', 
        whiteSpace: 'pre-wrap' 
      }}>
        {formattedText}
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
                  style={{ width: '100%', padding: '20px', borderRadius: '15px', background: '#FF5A00', color: '#fff', fontSize: '2.2rem', fontWeight: '900', border: 'none', cursor: 'pointer', boxShadow: '0 8px 25px rgba(255, 90, 0, 0.4)' }} 
                  onClick={handleCopy}
                >
                  [이 문구 복사하기]
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
