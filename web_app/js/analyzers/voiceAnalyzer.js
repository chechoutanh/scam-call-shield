/* ScamCall Shield - voice analyzer (Dev Guide 5.3).
 * Records a short clip (MediaRecorder, auto-stop), draws a live waveform, and
 * keeps a manual transcript box available. Speech recognition is disabled
 * until an on-device-only mode can be verified for the selected language.
 * Audio stays in memory only.
 * Also wraps SpeechSynthesis for the Family-Mode read-aloud feature.
 */
(function (g) {
  "use strict";
  g.SCS = g.SCS || {};

  function supportsRecording() {
    return !!(g.navigator && g.navigator.mediaDevices && g.navigator.mediaDevices.getUserMedia && g.MediaRecorder);
  }
  function supportsSTT() { return false; }

  /* Recorder object with start/stop, waveform draw, and auto-stop timer. */
  function createRecorder(opts) {
    opts = opts || {};
    var maxSec = opts.maxSeconds || 60;
    var onTick = opts.onTick || function () {};
    var onWave = opts.onWave || function () {};
    var onStop = opts.onStop || function () {};

    var stream = null, rec = null, chunks = [], audioCtx = null, analyser = null, rafId = null;
    var startTs = 0, timerId = null, objectUrl = null;

    function drawLoop() {
      if (!analyser) return;
      var buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buf);
      onWave(buf);
      rafId = g.requestAnimationFrame(drawLoop);
    }

    function start() {
      return g.navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s;
        chunks = [];
        rec = new g.MediaRecorder(stream);
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          var blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob);
          onStop(blob, objectUrl);
        };
        try {
          audioCtx = new (g.AudioContext || g.webkitAudioContext)();
          var src = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          src.connect(analyser);
          drawLoop();
        } catch (e) { /* waveform optional */ }
        rec.start();
        startTs = Date.now();
        timerId = g.setInterval(function () {
          var el = (Date.now() - startTs) / 1000;
          onTick(Math.min(el, maxSec));
          if (el >= maxSec) stop();
        }, 200);
      });
    }

    function stop() {
      if (timerId) { g.clearInterval(timerId); timerId = null; }
      if (rafId) { g.cancelAnimationFrame(rafId); rafId = null; }
      if (rec && rec.state !== "inactive") { try { rec.stop(); } catch (e) {} }
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; analyser = null; }
    }

    function dispose() {
      stop();
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    }

    return { start: start, stop: stop, dispose: dispose };
  }

  /* --- Text-to-speech (Family Mode read-aloud) --- */
  function speak(text, lang) {
    if (!g.speechSynthesis || !text) return false;
    try {
      g.speechSynthesis.cancel();
      var u = new g.SpeechSynthesisUtterance(text);
      u.lang = lang || "vi-VN";
      u.rate = 0.95;
      g.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  function stopSpeaking() { if (g.speechSynthesis) try { g.speechSynthesis.cancel(); } catch (e) {} }

  g.SCS.voice = {
    supportsRecording: supportsRecording,
    supportsSTT: supportsSTT,
    createRecorder: createRecorder,
    createTranscriber: function () { return null; },
    speak: speak,
    stopSpeaking: stopSpeaking
  };
})(typeof window !== "undefined" ? window : globalThis);
