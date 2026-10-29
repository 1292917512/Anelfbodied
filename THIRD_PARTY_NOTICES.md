# Asset provenance

The default Anelf character and application icon were generated with the built-in OpenAI image generation tool from the project owner's three supplied character references. The prompts and asset locations are documented in `docs/character.md`. These project assets use the repository's MIT license.

Coopanion was consulted for interaction and animation architecture. No Coopanion source code or character assets are included.

Live2D Cubism SDK for Web 5-r.5 Core and Framework are included under their own licenses, not the repository MIT license. See `vendor/cubism/README.md` and the bundled Core/Framework license files. Live2D and third-party character models are not included in the application.

The LPK/WPK format was researched using [spawner1145/lpk-unpacker](https://github.com/spawner1145/lpk-unpacker) (AGPL-3.0) and [Moeary/LpkUnpackerGUI](https://github.com/Moeary/LpkUnpackerGUI). Neither program is bundled or invoked. The client implements a bounded read-only resource adapter; it does not run package commands or redistribute imported character resources.

ZIP decompression uses [fflate](https://github.com/101arrowz/fflate), MIT license (Arjun Barrett). Its license accompanies the installed dependency.
