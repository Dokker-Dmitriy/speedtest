import { useEffect, useRef, useState, Component } from 'react';
import './App.css';
import Speedtest from './lib/speedtest';

// Граница ошибок
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', padding: '2em', color: '#ff0000' }}>
          <h2>Произошла ошибка</h2>
          <p>{this.state.error?.message || 'Неизвестная ошибка'}</p>
          <p>Пожалуйста, перезагрузите страницу или свяжитесь с поддержкой.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const SPEEDTEST_SERVERS = [];

const meterBk = /Trident.*rv:(\d+\.\d+)/i.test(navigator.userAgent) ? "#EAEAEA" : "#80808040";
const dlColor = "#6060AA";
const ulColor = "#616161";
const progColor = meterBk;

function App() {
  const [uiData, setUiData] = useState(null);
  const [testState, setTestState] = useState(-1);
  const [servers, setServers] = useState(SPEEDTEST_SERVERS);
  const [selectedServer, setSelectedServer] = useState(null);
  const [loading, setLoading] = useState(true);

  const dlMeterRef = useRef(null);
  const ulMeterRef = useRef(null);
  const speedtest = useRef(new Speedtest());

  useEffect(() => {
    speedtest.current.setParameter("telemetry_level", "basic");
    initServers();

    const animate = () => {
      updateUI();
      requestAnimationFrame(animate);
    };
    animate();

    return () => {};
  }, []);

  const initServers = () => {
    if (servers.length === 0) {
      setLoading(false);
      initUI();
    } else {
      speedtest.current.addTestPoints(servers);
      speedtest.current.selectServer((server) => {
        if (server) {
          setServers(servers.filter(s => s.pingT !== -1));
          setSelectedServer(server);
          setLoading(false);
          initUI();
        } else {
          setLoading(false);
          alert("Серверы недоступны");
        }
      });
    }
  };

  const drawMeter = (canvas, amount, bk, fg, progress, prog) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dp = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth * dp, ch = canvas.clientHeight * dp;
    const sizScale = ch * 0.0055;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    } else {
      ctx.clearRect(0, 0, cw, ch);
    }
    ctx.beginPath();
    ctx.strokeStyle = bk;
    ctx.lineWidth = 12 * sizScale;
    ctx.arc(cw / 2, ch - 58 * sizScale, ch / 1.8 - ctx.lineWidth, -Math.PI * 1.1, Math.PI * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = fg;
    ctx.lineWidth = 12 * sizScale;
    ctx.arc(
      cw / 2,
      ch - 58 * sizScale,
      ch / 1.8 - ctx.lineWidth,
      -Math.PI * 1.1,
      amount * Math.PI * 1.2 - Math.PI * 1.1
    );
    ctx.stroke();
    if (progress !== undefined && prog) {
      ctx.fillStyle = prog;
      ctx.fillRect(cw * 0.3, ch - 16 * sizScale, cw * 0.4 * progress, 4 * sizScale);
    }
  };

  const mbpsToAmount = (s) => 1 - (1 / (Math.pow(1.3, Math.sqrt(s))));

  const format = (d) => {
    d = Number(d);
    if (d < 10) return d.toFixed(2);
    if (d < 100) return d.toFixed(1);
    return d.toFixed(0);
  };

  const oscillate = () => 1 + 0.02 * Math.sin(Date.now() / 100);

  const initUI = () => {
    drawMeter(dlMeterRef.current, 0, meterBk, dlColor, 0, progColor);
    drawMeter(ulMeterRef.current, 0, meterBk, ulColor, 0, progColor);
    setUiData({ clientIp: '', dlStatus: '', ulStatus: '', pingStatus: '', jitterStatus: '' });
  };

  const updateUI = (forced = false) => {
    if (!uiData) return;

    // Не блокируем обновление сразу после завершения теста
    if (!forced && speedtest.current.getState() === -1) return;

    const status = uiData.testState;
    drawMeter(
      dlMeterRef.current,
      mbpsToAmount(Number(uiData.dlStatus * (status === 1 ? oscillate() : 1))),
      meterBk,
      dlColor,
      Number(uiData.dlProgress),
      progColor
    );
    drawMeter(
      ulMeterRef.current,
      mbpsToAmount(Number(uiData.ulStatus * (status === 3 ? oscillate() : 1))),
      meterBk,
      ulColor,
      Number(uiData.ulProgress),
      progColor
    );
  };

  const startStop = () => {
    if (speedtest.current.getState() === 3) {
      speedtest.current.abort();
      setUiData(null);
      setTestState(-1);
      initUI();
    } else {
      speedtest.current.onupdate = (data) => {
        setUiData(data);
        setTestState(data.testState);
      };

      speedtest.current.onend = (aborted) => {
        setTestState(aborted ? 5 : 4);
        updateUI(true);

        if (!aborted) {
          setUiData(prev => {
            if (!prev) return prev;
            const shareURL = `${window.location.origin}/results/?id=${prev.testId}`;
            return { ...prev, shareURL };
          });
        }
      };

      speedtest.current.start();
      setTestState(3);
    }
  };

  return (
    <ErrorBoundary>
      <div>
        {loading && (
          <div id="loading" className="visible">
            <p id="message"><span className="loadCircle"></span>Выбор сервера...</p>
          </div>
        )}
        <div id="testWrapper" className={loading ? "hidden" : "visible"}>
          <div
            className={testState === 3 ? "button_running" : "button_stop"}
            id="startStopBtn"
            onClick={startStop}
          >
            {testState === 3 ? "Стоп" : "Старт"}
          </div>
          <br />
          {servers.length > 0 && (
            <div id="serverArea">
              Сервер:{" "}
              <select
                id="server"
                onChange={(e) => speedtest.current.setSelectedServer(servers[e.target.value])}
                disabled={testState === 3}
              >
                {servers.map((server, i) => (
                  server.pingT !== -1 && (
                    <option key={i} value={i} selected={server === selectedServer}>
                      {server.name}
                    </option>
                  )
                ))}
              </select>
            </div>
          )}
          <div id="test">
            <div className="testGroup">
              <div className="testArea2">
                <div className="testName">Ping</div>
                <div id="pingText" className="meterText">
                  {uiData?.pingStatus ? format(uiData.pingStatus) : ''}
                </div>
                <div className="unit">ms</div>
              </div>
            </div>
            <div className="testGroup">
              <div className="testArea">
                <div className="testName">Входящая скорость</div>
                <canvas ref={dlMeterRef} className="meter" />
                <div id="dlText" className="meterText">
                  {uiData?.dlStatus && testState === 1 && uiData.dlStatus === 0
                    ? "..."
                    : format(uiData?.dlStatus || 0)}
                </div>
                <div className="unit">Mbit/s</div>
              </div>
              <div className="testArea">
                <div className="testName">Исходящая скорость</div>
                <canvas ref={ulMeterRef} className="meter" />
                <div id="ulText" className="meterText">
                  {uiData?.ulStatus && testState === 3 && uiData.ulStatus === 0
                    ? "..."
                    : format(uiData?.ulStatus || 0)}
                </div>
                <div className="unit">Mbit/s</div>
              </div>
            </div>
            <div id="ipArea">
              <span id="ip">{uiData?.clientIp}</span>
            </div>
            {uiData?.testId && (
              <div id="shareArea">
                <h3>Поделиться результатами</h3>
                <p>ID теста: <span id="testId">{uiData.testId}</span></p>
                <input
                  type="text"
                  value={uiData.shareURL}
                  id="resultsURL"
                  readOnly
                  onClick={(e) => {
                    e.target.select();
                    document.execCommand('copy');
                    alert('Ссылка скопирована');
                  }}
                />
                <img src={uiData.shareURL} id="resultsImg" alt="Результат теста" />
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
