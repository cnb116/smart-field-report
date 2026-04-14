import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, X, Sun, AlertTriangle } from 'lucide-react';
import './index.css';

const App = () => {
  const [memoText, setMemoText] = useState('');
  const [memos, setMemos] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentDate, setCurrentDate] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [reportContent, setReportContent] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [team, setTeam] = useState(null);
  const [showTeamSelection, setShowTeamSelection] = useState(false);


  // 🌤️ 날씨 상태
  const [weather, setWeather] = useState({ temp: '-', wind: 0, condition: '확인중...' });

  const recognitionRef = useRef(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.9780&appid=8d32b85750d4893706050e82c81d8f1e&units=metric&lang=kr`);
        if (res.data && res.data.main) {
          setWeather({ temp: Math.round(res.data.main.temp), wind: res.data.wind.speed, condition: res.data.weather[0].description });
        }
      } catch (e) { setWeather({ temp: '-', wind: 0, condition: '날씨 정보 없음' }); }
    };
    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 600000);
    return () => clearInterval(weatherTimer);
  }, []);

  // 🎙️ 음성 엔진
  useEffect(() => {
    const requestWakeLock = async () => { try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch (err) { } };
    requestWakeLock();
    const saved = localStorage.getItem('kimbanjang_memos');
    if (saved) setMemos(JSON.parse(saved));

    const savedTeam = localStorage.getItem('kimbanjang_team');
    if (savedTeam) setTeam(savedTeam);
    else setShowTeamSelection(true);

    const updateDate = () => { setCurrentDate(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).replace(/\. /g, '. ')); };
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
          setMemoText(prev => prev.trim().endsWith(transcript) ? prev : prev + (prev.length > 0 ? ' ' : '') + transcript);
        }
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    try {
      if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }
      else { recognitionRef.current?.start(); setIsListening(true); }
    } catch (e) { setIsListening(false); }
  };

  // 🚀 [전송 및 강력 정제 엔진] - 안전(Safety) 항목 완전 제거!
  const handleSendMemo = async () => {
    if (!memoText.trim()) return;
    setIsSending(true);
    setErrorMessage('데이터 전송 중...');

    const memoWebhookUrl = import.meta.env.VITE_MAKE_MEMO_URL;
    const reportWebhookUrl = import.meta.env.VITE_MAKE_REPORT_URL;

    try {
      const payload = {
        id: Date.now(), text: memoText, raw_content: memoText,
        team: team,
        timestamp: new Date().toISOString(), time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      };


      try { await axios.post(memoWebhookUrl, payload, { timeout: 120000 }); } catch (err) { console.error('시트 저장 에러'); }

      let rawResult = null;
      try {
        const response = await axios.post(reportWebhookUrl, payload, { timeout: 120000 });
        rawResult = response.data?.result || response.data;
      } catch (err) { throw new Error("리포트 응답 없음"); }

      // 🚨 정제기: 공정 / 특기만 추출
      let finalCleaned = { 공정: '', 특기: '' };
      if (rawResult) {
        let textToParse = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
        textToParse = textToParse.replace(/https?:\/\/[a-zA-Z0-9.\/_-]+/g, '');
        textToParse = textToParse.replace(/\*\*/g, '').replace(/\\n/g, '\n');

        try {
          const jsonMatch = textToParse.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // 공정에서 특기 찌꺼기 완전 제거
            finalCleaned.공정 = (parsed.공정 || '')
              .replace(/,?\s*특기\s*[:：]\s*특이사항\s*없음/g, '')
              .replace(/,?\s*특기\s*[:：][^\n]*/g, '')
              .trim();
            finalCleaned.특기 = parsed.특기 || '특이사항 없음';
          } else { throw new Error("Not JSON"); }
        } catch (e) {
          finalCleaned.공정 = textToParse
            .replace(/,?\s*특기\s*[:：][^\n]*/g, '')
            .replace(/["'{}]/g, '').trim();
          finalCleaned.특기 = '특이사항 없음';
        }
      }

      setReportContent(finalCleaned);
      setErrorMessage('');
      setShowAIPanel(true);

    } catch (e) {
      setReportContent({ 공정: '🚨 Make.com 전송 실패 (네트워크 확인 요망)', 특기: '' });
      setShowAIPanel(true);
    } finally { setIsSending(false); }
  };

  const handleSelectTeam = (selected) => {
    setTeam(selected);
    localStorage.setItem('kimbanjang_team', selected);
    setShowTeamSelection(false);
  };


  // 📋 카톡 복사기 (공정, 특기만 깔끔하게!)
  const handleCopy = async () => {
    if (!reportContent) return;
    let text = `일자: ${currentDate}\n\n`;
    if (reportContent.공정) text += `공정:\n${reportContent.공정}\n\n`;
    text += `● 특기: ${reportContent.특기 || '특이사항 없음'}`;

    try {
      await navigator.clipboard.writeText(text.trim());
      setErrorMessage('✅ 복사 완료!');
      setTimeout(() => setErrorMessage(''), 3000);
    } catch (err) { setErrorMessage('❌ 복사 실패'); }
  };

  const handleResetApp = () => {
    setShowAIPanel(false);
    setReportContent(null);
    setErrorMessage('');
    setMemoText('');
  };

  const highlightNumbers = (text) => {
    if (!text) return null;
    const parts = text.split(/(\d+(?:\.\d+)?\s*(?:명|인|대|개|팀|건|조|톤|kg|m|cm|mm|식|루베|헤베))/g);
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i} style={{ fontWeight: '900', color: '#000' }}>{part}</strong> : part);
  };

  return (
    <div className="app-container" style={{ background: '#111', minHeight: '100vh', padding: '15px', color: '#fff' }}>
      <AnimatePresence>
        {errorMessage && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', background: errorMessage.includes('✅') ? '#22c55e' : '#ef4444', color: '#fff', padding: '10px 20px', borderRadius: '30px', fontWeight: 'bold', zIndex: 100000, boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ backgroundColor: weather.wind >= 5 ? '#facc15' : '#222', color: weather.wind >= 5 ? '#000' : '#fff', padding: '12px', borderRadius: '10px', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', fontSize: '14px', marginTop: '40px' }}>
        {weather.wind >= 5 ? <AlertTriangle size={18} className="animate-bounce" /> : <Sun size={18} className="text-yellow-400" />}
        <span>{weather.wind >= 5 ? `⚠️ 강풍 주의 (초속 ${weather.wind}m)!` : `✅ 현재 기온 ${weather.temp}°C / 풍속 ${weather.wind}m/s`}</span>
      </div>

      <div className="date-header-industrial" style={{ textAlign: 'center', marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
        <span className="industrial-date" style={{ color: '#facc15', fontSize: '1.2rem', fontWeight: '900' }}>{currentDate}</span>
        {team && (
          <span onClick={() => setShowTeamSelection(true)} style={{ cursor: 'pointer', fontSize: '14px', color: '#aaa', background: '#222', padding: '4px 12px', borderRadius: '20px', border: '1px solid #333' }}>
            {team} <span style={{ fontSize: '10px' }}>▼ 변경</span>
          </span>
        )}
      </div>


      <div className="memo-container-industrial">
        <textarea style={{ width: '100%', height: '200px', background: '#222', color: '#fff', padding: '15px', borderRadius: '15px', border: '2px solid #333', fontSize: '18px', marginBottom: '20px', resize: 'none', outline: 'none' }} placeholder="현장 상황을 말해주이소..." value={memoText} onChange={(e) => setMemoText(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: '15px' }}>
        <button onClick={toggleListening} style={{ flex: 1, height: '70px', borderRadius: '20px', background: isListening ? '#ef4444' : '#2563eb', border: 'none', color: '#fff' }}>
          <Mic size={40} className={isListening ? 'animate-pulse' : ''} />
        </button>
        <button onClick={handleSendMemo} disabled={!memoText.trim() || isSending} style={{ flex: 1, height: '70px', borderRadius: '20px', background: '#f97316', border: 'none', color: '#fff', fontSize: '20px', fontWeight: '900' }}>
          {isSending ? <Loader2 className="animate-spin" /> : "단디 전송"}
        </button>
      </div>

      <AnimatePresence>
        {showAIPanel && reportContent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999, padding: '20px' }}>
            <motion.div style={{ background: '#FFFDF0', color: '#111', borderRadius: '20px', width: '100%', maxWidth: '500px', padding: '25px', boxShadow: '0 15px 35px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', borderBottom: '2px solid #222', paddingBottom: '10px', marginBottom: '15px' }}>📋 현장 보고서 결과</h2>

              <div style={{ fontSize: '15px', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                {reportContent.공정 && <div style={{ marginBottom: '15px' }}><strong style={{ color: '#E87A30' }}>● 공정:</strong><br />{highlightNumbers(reportContent.공정)}</div>}
                {reportContent.특기 && <div style={{ marginBottom: '15px' }}><strong style={{ color: '#E87A30' }}>● 특기:</strong><br />{highlightNumbers(reportContent.특기)}</div>}
              </div>

              <button onClick={handleCopy} style={{ width: '100%', marginTop: '15px', padding: '15px', background: '#E87A30', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '18px' }}>📋 복사하기</button>
              <button onClick={handleResetApp} style={{ width: '100%', marginTop: '10px', background: '#ddd', color: '#333', padding: '15px', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '16px' }}>닫기 및 새 작업 시작</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTeamSelection && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, backgroundColor: '#111', zIndex: 200000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.h1 initial={{ y: -20 }} animate={{ y: 0 }} style={{ fontSize: '28px', fontWeight: '900', marginBottom: '40px', color: '#facc15', textAlign: 'center' }}>어느 소속이신지<br/>선택해주이소</motion.h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '400px' }}>
              {['안전반', '건축반', '환경반'].map((t) => {
                const icon = t === '안전반' ? '🦺' : t === '건축반' ? '🏗️' : '🌿';
                return (
                  <button key={t} onClick={() => handleSelectTeam(t)} style={{ padding: '30px', fontSize: '24px', fontWeight: '900', borderRadius: '20px', backgroundColor: '#222', color: '#fff', border: '3px solid #facc15', boxShadow: '0 10px 20px rgba(0,0,0,0.3)', cursor: 'pointer' }}>
                    {icon} {t}
                  </button>
                );
              })}
            </div>
            <p style={{ marginTop: '30px', color: '#666', fontSize: '14px' }}>※ 한 번 선택하면 기억함다</p>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default App;
