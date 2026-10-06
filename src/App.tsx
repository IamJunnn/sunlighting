import { useEffect } from 'react';
import { useStore } from './store';
import { hashFor, parseHash } from './lib/hash';
import { LocationPicker } from './components/LocationPicker';
import { Viewer } from './components/Viewer';

export default function App() {
  const { location, dateStr, minuteOfDay, layer, mode, playing, setLocation } = useStore();

  // Keep the URL hash in sync so a view can be bookmarked or shared (paused only, to avoid spamming history).
  useEffect(() => {
    if (playing) return;
    const want = hashFor(location, dateStr, minuteOfDay, layer, mode);
    if (window.location.hash !== want) history.replaceState(null, '', want || window.location.pathname);
  }, [location, dateStr, minuteOfDay, layer, mode, playing]);

  // Browser back/forward or a pasted link.
  useEffect(() => {
    const onChange = () => {
      const h = parseHash();
      const st = useStore.getState();
      const cur = st.location;
      if (h && (!cur || cur.lat !== h.location.lat || cur.lon !== h.location.lon)) setLocation(h.location);
      else if (!h && cur) setLocation(null);
      if (h) {
        if (h.dateStr && h.dateStr !== st.dateStr) st.setDateStr(h.dateStr);
        if (h.minuteOfDay !== undefined && Math.round(h.minuteOfDay) !== Math.round(st.minuteOfDay)) st.setMinute(h.minuteOfDay);
        if (h.layer && h.layer !== st.layer) st.setLayer(h.layer);
        if (h.mode && h.mode !== st.mode) st.setMode(h.mode);
      }
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [setLocation]);

  return location ? <Viewer /> : <LocationPicker />;
}
