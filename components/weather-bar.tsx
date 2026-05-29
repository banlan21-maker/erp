"use client";

import { useEffect, useState } from "react";
import { RefreshCw, MapPin } from "lucide-react";

/* ── Open-Meteo WMO 날씨 코드 → 한글 라벨 + 이모지 ── */
const WMO: Record<number, { label: string; emoji: string; cls: string }> = {
  0:  { label: "맑음",         emoji: "☀️",  cls: "text-amber-500" },
  1:  { label: "대체로 맑음",  emoji: "🌤",  cls: "text-amber-500" },
  2:  { label: "구름 조금",    emoji: "⛅",  cls: "text-amber-400" },
  3:  { label: "흐림",         emoji: "☁️",  cls: "text-gray-500" },
  45: { label: "안개",         emoji: "🌫",  cls: "text-gray-500" },
  48: { label: "짙은 안개",    emoji: "🌫",  cls: "text-gray-600" },
  51: { label: "이슬비 약함",  emoji: "🌦",  cls: "text-blue-500" },
  53: { label: "이슬비",       emoji: "🌦",  cls: "text-blue-500" },
  55: { label: "이슬비 강함",  emoji: "🌧",  cls: "text-blue-600" },
  61: { label: "약한 비",      emoji: "🌧",  cls: "text-blue-500" },
  63: { label: "비",           emoji: "🌧",  cls: "text-blue-600" },
  65: { label: "강한 비",      emoji: "🌧",  cls: "text-blue-700" },
  71: { label: "약한 눈",      emoji: "🌨",  cls: "text-sky-500" },
  73: { label: "눈",           emoji: "❄️",  cls: "text-sky-600" },
  75: { label: "강한 눈",      emoji: "❄️",  cls: "text-sky-700" },
  77: { label: "싸락눈",       emoji: "🌨",  cls: "text-sky-600" },
  80: { label: "약한 소나기",  emoji: "🌦",  cls: "text-blue-500" },
  81: { label: "소나기",       emoji: "🌧",  cls: "text-blue-600" },
  82: { label: "강한 소나기",  emoji: "⛈",  cls: "text-blue-700" },
  85: { label: "약한 눈소나기",emoji: "🌨",  cls: "text-sky-600" },
  86: { label: "눈소나기",     emoji: "❄️",  cls: "text-sky-700" },
  95: { label: "천둥번개",     emoji: "⛈",  cls: "text-purple-600" },
  96: { label: "천둥번개+우박",emoji: "⛈",  cls: "text-purple-700" },
  99: { label: "강한 천둥번개",emoji: "⛈",  cls: "text-purple-800" },
};
const codeInfo = (c: number | null | undefined) => (c != null && WMO[c]) || { label: "-", emoji: "·", cls: "text-gray-400" };

interface SiteSpec { name: string; addr: string; lat: number; lon: number; }
const SITES: SiteSpec[] = [
  { name: "진교", addr: "하동군 진교면",          lat: 34.998, lon: 127.870 },
  { name: "진동", addr: "창원시 마산합포구 진전면", lat: 35.094, lon: 128.464 },
];

interface WeatherData {
  currentTemp: number;
  weatherCode: number;
  wind: number;
  humidity: number;
  precipProb: number; // 현재 시간 강수확률
  todayMax: number;
  todayMin: number;
  next6h: { time: string; temp: number; code: number; pop: number; }[];
}

async function fetchWeather(site: SiteSpec): Promise<WeatherData | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",  String(site.lat));
  url.searchParams.set("longitude", String(site.lon));
  url.searchParams.set("current",   "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m");
  url.searchParams.set("hourly",    "temperature_2m,weather_code,precipitation_probability");
  url.searchParams.set("daily",     "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone",  "Asia/Seoul");
  url.searchParams.set("forecast_days", "2");
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();

    // 현재 시간 기준으로 시간별 인덱스 찾기
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}T${String(now.getHours()).padStart(2,"0")}:00`;
    const times: string[] = data.hourly?.time ?? [];
    let idx = times.indexOf(nowKey);
    if (idx < 0) idx = 0;
    const next6: WeatherData["next6h"] = [];
    for (let i = 1; i <= 6 && idx + i < times.length; i++) {
      next6.push({
        time: times[idx + i].slice(11, 16),
        temp: Math.round(data.hourly.temperature_2m[idx + i]),
        code: data.hourly.weather_code[idx + i],
        pop:  data.hourly.precipitation_probability?.[idx + i] ?? 0,
      });
    }

    return {
      currentTemp: Math.round(data.current?.temperature_2m ?? 0),
      weatherCode: data.current?.weather_code ?? 0,
      wind:        Math.round((data.current?.wind_speed_10m ?? 0) * 10) / 10,
      humidity:    Math.round(data.current?.relative_humidity_2m ?? 0),
      precipProb:  data.hourly?.precipitation_probability?.[idx] ?? 0,
      todayMax:    Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
      todayMin:    Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
      next6h:      next6,
    };
  } catch {
    return null;
  }
}

function SiteCard({ site, data, loading }: { site: SiteSpec; data: WeatherData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-center gap-3 text-gray-400 text-sm">
        <RefreshCw size={14} className="animate-spin" /> {site.name} 날씨 로드 중…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 text-gray-400 text-sm">
        {site.name} 날씨를 불러오지 못했습니다.
      </div>
    );
  }
  const c = codeInfo(data.weatherCode);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-4">
        {/* 좌측 — 도시/주소 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-gray-900 font-bold">
            <MapPin size={13} className="text-blue-500" /> {site.name}
          </div>
          <p className="text-[11px] text-gray-400 truncate">{site.addr}</p>
        </div>
        {/* 중앙 — 현재 기온 + 상태 */}
        <div className="flex items-center gap-2">
          <span className="text-3xl">{c.emoji}</span>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 leading-none">{data.currentTemp}°</div>
            <div className={`text-xs font-semibold ${c.cls}`}>{c.label}</div>
          </div>
        </div>
        {/* 우측 — 보조 정보 */}
        <div className="text-right text-[11px] text-gray-500 leading-tight border-l border-gray-100 pl-4">
          <div>최고 <strong className="text-red-500">{data.todayMax}°</strong> / 최저 <strong className="text-blue-500">{data.todayMin}°</strong></div>
          <div>강수확률 <strong className="text-blue-600">{data.precipProb}%</strong></div>
          <div>풍속 {data.wind}m/s · 습도 {data.humidity}%</div>
        </div>
      </div>
      {/* 시간별 예보 (6시간) */}
      {data.next6h.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-gray-600">
          {data.next6h.map(h => {
            const hc = codeInfo(h.code);
            return (
              <div key={h.time} className="flex flex-col items-center gap-0.5 flex-1">
                <span className="text-gray-400">{h.time}</span>
                <span className="text-base leading-none">{hc.emoji}</span>
                <span className="font-semibold text-gray-700">{h.temp}°</span>
                <span className="text-[10px] text-blue-500">{h.pop}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WeatherBar() {
  const [data, setData] = useState<(WeatherData | null)[]>([null, null]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const results = await Promise.all(SITES.map(fetchWeather));
    setData(results);
    setLoading(false);
    setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }));
  };

  useEffect(() => {
    load();
    // 10분마다 자동 갱신
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-500 tracking-wider uppercase">현재 날씨</h3>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600 disabled:opacity-50">
          {updatedAt && <span>{updatedAt} 기준</span>}
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SITES.map((s, i) => (
          <SiteCard key={s.name} site={s} data={data[i]} loading={loading} />
        ))}
      </div>
    </section>
  );
}
