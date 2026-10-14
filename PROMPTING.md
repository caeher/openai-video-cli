# Prompt engine

Prompts are plain natural language. No special Sora syntax, endpoint parameters or spatial guarantees are fabricated. The historical Sora guide informs cinematic description only and does not establish current API availability.

JSON/YAML fields: `subject`, `scene`, `environment`, `mainAction`, `secondaryActions`, `cameraMovement`, `framing`, `lens`, `lighting`, `colorPalette`, `visualStyle`, `temporalSequence`, `motionPhysics`, `characterContinuity`, `audioDescription`, `dialogue`, `avoidance`, `referenceAssets`, `shotTransitions`. Fields are strings up to 4000 characters. At least subject, scene or mainAction is required. Unknown keys fail validation. Duplicate YAML keys and excessive aliases are rejected.

Each field also has a kebab-case terminal option, such as `--camera-movement`, `--main-action` or `--audio-description`. `--template` applies defaults, then file fields override defaults, then terminal fields override file values. `create --output` writes the validated JSON specification; `build --output` writes UTF-8 text. Existing files are protected.

Templates: cinematic, documentary, product-showcase, anime, 3d-animation, nature, architecture, social-media, music-video, educational, commercial, realistic-portrait and action-scene.

```sh
oaivideo prompt create --template cinematic --subject "A glass bottle" \
  --scene "On a marble counter" --main-action "A hand rotates the bottle" \
  --camera-movement "Slow push in" --lighting "Soft side light" --output product.json
oaivideo prompt build --file product.json --output product.txt
oaivideo prompt validate --file product.json --json
oaivideo prompt inspect --file product.json
oaivideo prompt templates
```

Audio, avoidance, dialogue and character continuity remain descriptions in the text. They never cause unsupported wire parameters to be added. A first frame or last frame is a distinct typed reference and requires native model support; it cannot be inferred from a description.

`prompt optimize` explicitly calls Responses with the configured text model, `store: false` and a bounded output. It accepts raw text via `--prompt` or `--prompt-file`. Use `prompt build` first to turn JSON/YAML into text. Review `--dry-run` and use `--max-cost`/`--confirm-cost`. Optional optimization is never performed by local prompt commands.

Regional motion specifications store an image, optional matching non-uniform PNG mask, normalized polygons, control points, vectors in [-1,1], descriptive intensity, stationary elements and descriptions. `motion inspect`/`validate` produce a textual approximation and `nativeSupported: false`. Coordinates and masks are not sent to any video endpoint. Language cannot guarantee pixel-level spatial compliance.
