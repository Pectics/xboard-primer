<!doctype html>
<html lang="zh-CN" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>{{ $title }}</title>
  <script>
    try { document.documentElement.dataset.colorMode = localStorage.getItem('vueuse-color-scheme') || 'auto' } catch {}
    window.routerBase = "/";
    window.settings = {{ Illuminate\Support\Js::from([
      'title' => $title,
      'assets_path' => "/theme/{$theme}/assets",
      'theme' => ['color' => $theme_config['theme_color'] ?? 'default'],
      'version' => $version,
      'background_url' => $theme_config['background_url'] ?? '',
      'description' => $description,
      'i18n' => ['zh-CN', 'en-US', 'ja-JP', 'vi-VN', 'ko-KR', 'zh-TW', 'fa-IR', 'ru-RU'],
      'logo' => $logo,
    ]) }};
  </script>
  <link rel="stylesheet" href="/theme/{{ $theme }}/assets/__PORTAL_CSS__">
  <script type="module" src="/theme/{{ $theme }}/assets/__PORTAL_JS__"></script>
</head>
<body>
  <div id="app"></div>
  {!! $theme_config['custom_html'] ?? '' !!}
</body>
</html>
