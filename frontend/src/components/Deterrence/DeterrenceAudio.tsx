import { useEffect } from 'react';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { sirenEngine } from '../../utils/sirenEngine';

// Mounted once for the whole app: whenever the siren is sounding in the field,
// this browser plays the same pattern (if "play on this device" is on), on
// every page — not just while the Deterrence page is open.
export default function DeterrenceAudio() {
  const siren = useDeterrenceStore((s) => s.server.siren);
  const pattern = useDeterrenceStore((s) => s.server.pattern);
  const playHere = useDeterrenceStore((s) => s.playHere);
  const volume = useDeterrenceStore((s) => s.volume);

  useEffect(() => {
    sirenEngine.bindUnlock();
    return () => sirenEngine.stop();
  }, []);

  useEffect(() => {
    if (siren && playHere) sirenEngine.play(pattern, volume);
    else sirenEngine.stop();
    // volume is applied by the effect below without restarting the sound
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siren, playHere, pattern]);

  useEffect(() => {
    sirenEngine.setVolume(volume);
  }, [volume]);

  return null;
}
