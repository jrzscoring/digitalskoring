import blueMalePortrait from '../assets/images/athlete_blue_male_1795235472439.jpg';
import blueFemalePortrait from '../assets/images/athlete_blue_portrait_1795235456935.jpg';
import redMalePortrait from '../assets/images/athlete_red_portrait_1795235456981.jpg';
import redFemalePortrait from '../assets/images/athlete_red_female_1795235473044.jpg';
import type { Corner } from '../types/silat';

export function getDefaultAthletePhoto(corner: Corner, weightClass?: string): string {
  const isFemale = (weightClass || '').toLowerCase().includes('putri');
  if (corner === 'blue') {
    return isFemale ? blueFemalePortrait : blueMalePortrait;
  }
  return isFemale ? redFemalePortrait : redMalePortrait;
}

export function resolveAthletePhoto(
  customPhoto: string | undefined,
  corner: Corner,
  weightClass?: string
): { src: string; isCustom: boolean } {
  const trimmed = (customPhoto || '').trim();
  if (trimmed) {
    return { src: trimmed, isCustom: true };
  }
  return { src: getDefaultAthletePhoto(corner, weightClass), isCustom: false };
}

export function readAndResizeAthletePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file foto atlet.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        // Resize cleanly to max 320px portrait/square aspect while keeping Firestore size strictly < 240KB
        const targetMax = 320;
        const scale = Math.min(1, targetMax / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (dataUrl.length <= 240000) {
            resolve(dataUrl);
          } else {
            reject(new Error('Ukuran foto terlalu besar untuk diproses.'));
          }
          return;
        }
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        let quality = 0.82;
        let output = canvas.toDataURL('image/jpeg', quality);
        while (output.length > 240000 && quality > 0.35) {
          quality -= 0.12;
          output = canvas.toDataURL('image/jpeg', quality);
        }
        if (output.length > 240000) {
          reject(new Error('Ukuran foto terlalu besar. Pilih foto dengan resolusi lebih kecil.'));
          return;
        }
        resolve(output);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
