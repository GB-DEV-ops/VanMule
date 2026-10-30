# Third-party notices

VanMule is MIT licensed. It ships with, downloads, or talks to the following third-party work. Each keeps its own license.

## Bundled in the app

| Component | What it does | License |
|---|---|---|
| [Electron](https://www.electronjs.org/) | The desktop app shell | MIT |
| [onnxruntime-node](https://onnxruntime.ai/) | Runs the AI voice models (DirectML / CPU) | MIT |
| [RNNoise](https://gitlab.xiph.org/xiph/rnnoise) (`app/rnnoise-worklet.js`) | AI noise removal | BSD-3 / Apache-2.0, see `app/rnnoise.LICENSE.txt` |
| [lamejs](https://github.com/zhuker/lamejs) (`app/lame.min.js`) | MP3 encoding for exports | LGPL-3.0, see `app/lame.LICENSE.txt` |
| [gifenc](https://github.com/mattdesl/gifenc) (`app/gifenc.js`) | GIF encoding for memes | MIT |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (`app/mp4-muxer.js`) | MP4 recordings | MIT |
| [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (`app/lightweight-charts.js`) | Stock charts (TradingView attribution shown in the app) | Apache-2.0 |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (`app/qrcode.js`) | QR code for the phone remote | MIT |
| [Figtree](https://fonts.google.com/specimen/Figtree), [Unbounded](https://fonts.google.com/specimen/Unbounded), [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (`app/fonts/`) | Typefaces | SIL Open Font License 1.1 |
| [Twemoji](https://github.com/twitter/twemoji) | Seasonal decoration artwork | CC-BY 4.0 |
| RVC v2 synthesizer templates (`templates/`) | Graph templates the engine fills with an imported model's weights | MIT (derived from [RVC](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)) |

## Downloaded on first use (not included in the installer)

| Component | When | License |
|---|---|---|
| [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) | Setup, to create the virtual microphone | Donationware, VB-Audio's own license; installed by its own installer |
| HuBERT speech encoder (`hubert_base.onnx`) | First AI voice | MIT (from [fairseq](https://github.com/facebookresearch/fairseq)) |
| RMVPE pitch tracker (`rmvpe.onnx`) | First AI voice | MIT (from [RVC](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)) |
| [FCPE pitch tracker](https://huggingface.co/Scicom-intl/fcpe-onnx) (`fcpe.onnx`) | If you pick the Fast pitch tracker | MIT |
| [Intel PresentMon](https://github.com/GameTechDev/PresentMon) | If you turn on the FPS counter | MIT |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [Deno](https://deno.com/) | If you make a GIF from a YouTube link | Unlicense / MIT |

## Online services the app talks to

ESPN (scores, schedules, standings), Yahoo Finance (quotes and charts), Yahoo Fantasy, Sleeper, IsThereAnyDeal, CheapShark, Steam, SteamSpy, Microsoft Store, Epic Games Store, RAWG, TMDB, OMDb, TVmaze, Open-Meteo, Slickdeals, Imgflip, Hugging Face, Cloudflare (ping). Each has its own terms of use. VanMule sends no data of yours to a server of its own.

Voice models you import are yours. VanMule does not include, search for or distribute any.
