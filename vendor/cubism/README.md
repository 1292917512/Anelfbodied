# Live2D Cubism SDK for Web 5-r.5

Upstream: https://www.live2d.com/en/sdk/download/web/

Archive: https://cubism.live2d.com/sdk-web/bin/CubismSdkForWeb-5-r.5.zip

Archive SHA-256: `67064a7fb1812cf502f5c4a03bfe12cc638c75a621bb4acf06bb28763df06ba0`

`Framework/` contains the official framework compiled to ES modules with declarations, using the archive's tsconfig and TypeScript 5.9.3 (`--module ESNext --sourceMap false --declarationMap false --skipLibCheck true`). `Shaders/` and the redistributable `Core/` files are unmodified SDK resources. Source samples, editor assets and example characters are excluded.

Core uses the Live2D Proprietary Software License. Framework and shaders use the Live2D Open Software License. Their license files are retained beside them and copied to the application build. The project's MIT license does not replace these licenses. Check the applicable SDK release terms before distributing a product, including the terms for expandable applications.

Application-specific code belongs in `src/components/live2d/`; do not modify the SDK to implement product behavior. Replacing the SDK requires validating its shaders, Core, framework and model formats together.
