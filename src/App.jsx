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

  // 잡내 및 출력하지 않을 줄(일자, 구역 등) 부분 극단적 삭제 헬퍼 함수
  const cleanAiText = (val) => {
    if (typeof val !== 'string') return val;
    
    // 마크다운 별표(**) 제거 및 http/https URL 제거
    let cleaned = val.replace(/https?:\/\/[^\s]+/g, '').replace(/\*\*/g, '').trim();

    // '일자', '날짜', '구역' 관련 라인 완전 삭제
    cleaned = cleaned.replace(/^.*(일자|날짜|구역)\s*[:：\s].*$/gm, '');

    // 2024년 등 엉뚱한 날짜가 문장에 섞여 나오면 무조건 지워버림 (공백 치환)
    const dateRegex = /202\d\s*(?:년\s*(?:\d{1,2}\s*월\s*\d{1,2}\s*일?)?|[\-\.]\s*\d{1,2}[\-\.]\s*\d{1,2}[일\.]?)/g;
    cleaned = cleaned.replace(dateRegex, '');

    // 삭제 후 생긴 잉여 줄바꿈 정리
    cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();

    return cleaned;
  };

  const formatReportContentForCopy = (data) => {
    if (!data) return '';
    
    // 문자열응답일 경우 cleanAiText에서 이미 일자/구역 라인이 지워진 상태로 반환됩니다.
    if (typeof data === 'string') {
      let cleanedStr = cleanAiText(data);
      // '● ' 기호가 없는 경우 각 라인에 맞춰 보정 (이미 제미나이가 붙여준 경우 통과)
      cleanedStr = cleanedStr.replace(/^(공정\s*[:：])/gm, '● $1');
      cleanedStr = cleanedStr.replace(/^(안전\s*[:：])/gm, '● $1');
      cleanedStr = cleanedStr.replace(/^(특기\s*[:：])/gm, '● $1');
      // 제목과 내용을 줄바꿈으로 분리
      cleanedStr = cleanedStr.replace(/●\s*(공정|안전|특기)\s*[:：]\s*/g, '● $1:\n');
      return cleanedStr;
    }
    
    // 객체 데이터인 경우 우리가 오직 '공정', '안전', '특기' 3가지만 추출 (명시된 ● 말머리 추가)
    // 일자, 구역은 배열에 아예 포함하지 않음.
    const entries = [
      data.공정 ? `● 공정:\n${cleanAiText(String(data.공정))}` : '',
      data.안전 ? `● 안전:\n${cleanAiText(String(data.안전))}` : '',
      data.특기 ? `● 특기:\n${cleanAiText(String(data.특기))}` : ''
    ].filter(Boolean);
    
    // 복사 시에도 줄간 여백을 위해 이중 줄바꿈 처리
    return entries.join('\n\n');
  };

  const handleCopy = async () => {
    try {
      // 복사 시에는 맨 윗줄에 일자를 수동으로 포함시킵니다.
      const text = `일자: ${currentDate}\n\n` + formatReportContentForCopy(reportContent);
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
    
    // 개행 단위로 모든 라인을 개별 분리
    const lines = formattedText.split('\n').map(l => l.trim()).filter(Boolean);

    // 사람, 장비 등 수량형 데이터 하이라이팅 처리
    const highlightNumbers = (text) => {
      const regex = /(\d+(?:\.\d+)?\s*(?:명|인|대|개|팀|건|조|톤|kg|m|cm|mm|식|루베|헤베))/g;
      const parts = text.split(regex);
      return parts.map((part, i) => {
        if (i % 2 === 1) {
          return (
            <strong key={i} style={{ fontWeight: '900', color: '#000' }}>
              {part}
            </strong>
          );
        }
        return part;
      });
    };

    return (
      <div style={{ width: '100%', padding: '0 4px' }}>
        <style>{`
          .super-force-text-row {
            font-size: 16px !important;
            line-height: 1.6 !important;
            word-break: keep-all !important;
            text-align: left !important;
            color: #111 !important;
          }
        `}</style>
        {lines.map((line, idx) => {
          const isHeader = line.startsWith('●');
          return (
            <div key={idx} className="super-force-text-row" style={{ 
              marginTop: isHeader && idx !== 0 ? '16px' : '2px',
              fontWeight: isHeader ? '900' : 'normal',
              paddingLeft: isHeader ? '0' : '6px'
            }}>
              {highlightNumbers(line)}
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
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 999999,
              padding: '0 1%' // 양옆 여백을 아주 미세하게만 줌
            }}
          >
            <style>{`
              .super-force-modal {
                width: 98% !important;
                max-width: 800px !important;
              }
            `}</style>
            <motion.div 
              className="modal-content super-force-modal"
              style={{ 
                background: '#FFFDF0', // 눈이 편안한 아이보리/미색
                borderRadius: '8px',
                maxHeight: '92vh', 
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 15px 35px rgba(0,0,0,0.5)',
                overflow: 'hidden'
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 우측 상단 닫기 X 아이콘 및 헤더 (Image 2 스타일) */}
              <div style={{ background: '#3A3A3A', padding: '16px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                <span style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 'bold' }}>현장 보고서</span>
                <button 
                  onClick={() => setShowAIPanel(false)}
                  style={{ position: 'absolute', right: '15px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '0', display: 'flex' }}
                >
                  <X size={24} />
                </button>
              </div>

              {/* 본문 (베이지색 페이퍼 영역) */}
              <div style={{ padding: '16px 12px', overflowY: 'auto', flex: 1 }}>
                
                <h2 style={{ fontSize: '18px', fontWeight: '900', color: '#111', margin: '0 0 10px 0', paddingLeft: '4px' }}>
                  일자: {currentDate}
                </h2>
                <div style={{ borderBottom: '2px solid #222', marginBottom: '16px' }}></div>

                {renderReportTable(reportContent)}

                <div style={{ marginTop: '24px' }}>
                  <button 
                    style={{ 
                      width: '100%', 
                      padding: '12px',     // 화면 가리지 않게 버튼 크기 적당히 조절
                      borderRadius: '10px', 
                      background: '#E87A30', 
                      color: '#fff', 
                      fontSize: '1.2rem', 
                      fontWeight: 'bold', 
                      border: 'none', 
                      cursor: 'pointer', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
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
