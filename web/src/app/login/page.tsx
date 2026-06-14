"use client";

// Cafe24 OAuth는 카페24 콜백(공개 HTTPS 도메인)과 같은 출처에서 시작해야
// state 쿠키가 콜백까지 전달된다. OAuth 경로(/auth/cafe24/*)는 /api prefix가 없으므로
// 일반 API base와 분리한다. (미설정 시 API base에서 /api를 떼어 폴백)
const OAUTH_BASE =
  process.env.NEXT_PUBLIC_OAUTH_BASE ||
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api\/?$/, "") ||
  "http://127.0.0.1:8000";

export default function LoginPage() {
  function handleCafe24Login() {
    // 쇼핑몰 ID는 서버의 .env(CAFE24_MALL_ID)를 사용하므로 입력받지 않고
    // 곧바로 카페24 OAuth 인증으로 넘어간다.
    window.location.href = `${OAUTH_BASE}/auth/cafe24/login`;
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-2">GG 로그인</h1>
        <p className="text-sm text-slate-900 mb-6">
          1인 쇼핑몰을 AI와 함께 운영해 보세요.
        </p>

        {/* Cafe24 OAuth 로그인 (유일한 로그인 수단) */}
        <button
          type="button"
          onClick={handleCafe24Login}
          className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          카페24 계정으로 로그인
        </button>

        <p className="mt-6 text-xs text-slate-500 text-center">
          카페24 계정으로 안전하게 로그인합니다.
        </p>
      </div>
    </main>
  );
}
