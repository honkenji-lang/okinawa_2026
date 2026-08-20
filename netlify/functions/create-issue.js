// GitHubアカウントを持たない投稿者の代わりに、サーバー側で保持したトークンを使って
// GitHub Issueを作成するプロキシ関数。
//
// 必要な環境変数 (Netlifyの Site settings > Environment variables で設定):
//   GITHUB_TOKEN      : このリポジトリの "Issues: Read and write" のみを持つ fine-grained PAT
//   GITHUB_REPO        : 省略時は "honkenji-lang/okinawa_2026"
//   SUBMIT_PASSPHRASE  : フォームに入力させる簡易合言葉 (未設定なら合言葉チェックは省略される)
//   ALLOWED_ORIGIN     : CORSで許可するオリジン (例: "https://honkenji-lang.github.io")。未設定時は "*"

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { title, body, passphrase, honeypot } = payload;

  // ハニーポット: 人間には見えない入力欄。埋まっていればボットとみなし、
  // 手の内を明かさないよう成功したフリだけして何もしない。
  if (honeypot) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  const expectedPassphrase = process.env.SUBMIT_PASSPHRASE;
  if (expectedPassphrase && passphrase !== expectedPassphrase) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: '合言葉が違います' }) };
  }

  if (typeof title !== 'string' || !title.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'タイトルは必須です' }) };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'サーバー側のトークンが未設定です' }) };
  }

  const githubRepo = process.env.GITHUB_REPO || 'honkenji-lang/okinawa_2026';

  try {
    const res = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'User-Agent': 'okinawa-2026-netlify-function',
      },
      body: JSON.stringify({
        title: title.trim().slice(0, MAX_TITLE_LENGTH),
        body: (typeof body === 'string' ? body : '').slice(0, MAX_BODY_LENGTH),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data.message || 'GitHub API error' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ number: data.number, html_url: data.html_url, title: data.title }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'GitHub APIへの接続に失敗しました' }) };
  }
};
