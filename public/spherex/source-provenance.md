# SphereX public source and build provenance

Release: 2026.10.16-preview. Gameplay source snapshot: 8 October 2026. Public clean build: 16 October 2026.

The complete source archive contains the exported Source-X tree, custom console/map/administration features, dependency sources and build support present in the existing complete export. All 587 source files in the retained 8 October native build inventory match exactly. The exported tree has no upstream Git commit metadata; its content hashes identify it. No Git revision or official upstream release identity is invented.

The source retains the 8 October disabled-facet initialization guard and the preceding UTF-8 BOM/empty-line reader corrections. Earlier console, tracking, walking and administration changes remain. No gameplay source was changed for publication.

The previous verified private native executable was SHA-256 `bff390ad32890878bb664555460c9fa52b5d777b4aab2347eaeb7f7b5acbac12`. A clean public executable was required because that private build embedded absolute compiler paths. `PublicBuild.cmake` supplies compiler prefix mapping to replace those paths with `Source-X`, and sets baseline `-march=x86-64 -mtune=generic` after the project's host-CPU flags. The new executable has a separate identity in `release.json`; this is a new build of the same gameplay source, not the older binary with a new filename.

## Rebuild

Use the Windows x64 UCRT LLVM MinGW 20260908 toolchain and CMake 4.4.3, with the toolchain's `bin` directory on PATH. Keep the source archive's `PublicBuild.cmake` beside `Source-X-master`. Run these commands from the archive root:

```powershell
$publicBuild = (Resolve-Path ./PublicBuild.cmake).Path.Replace('\', '/')
$publicToolchain = (Resolve-Path ./Source-X-master/cmake/toolchains/Windows-GNU-x86_64.cmake).Path.Replace('\', '/')
cmake -S Source-X-master -B build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Nightly -DCMAKE_NO_GIT_REVISION=ON -DCMAKE_LINKER_TYPE=LLD -DCMAKE_MAKE_PROGRAM=mingw32-make.exe "-DCMAKE_PROJECT_INCLUDE=$publicBuild" "-DCMAKE_TOOLCHAIN_FILE=$publicToolchain"
cmake -S Source-X-master -B build
cmake --build build --target spheresvr_nightly --parallel 8
cmake -S Source-X-master/tests/console_tools -B console-tests -G "MinGW Makefiles" -DCMAKE_MAKE_PROGRAM=mingw32-make.exe "-DCMAKE_PROJECT_INCLUDE=$publicBuild"
cmake --build console-tests --parallel 4
ctest --test-dir console-tests --output-on-failure
```

The second configure is intentional: upstream generates MariaDB compatibility headers before the standard-header checks have populated a new cache. The second pass retains the verified header definitions. The Nightly build otherwise uses the project's existing compile flags, plus the public path-mapping and baseline-x64 options above. Runtime static linking, forced debug information, sanitizers, compiler hardening and the additional Windows console are disabled. Zlib and SQLite are built from the included sources. The Windows executable is stripped by the normal project build. Build timestamps and local toolchain details can change resulting bytes, so these instructions establish the build process rather than promising bit-for-bit reproducibility.

The runtime retains the replaceable original `libc++.dll`, `libunwind.dll` and `libmariadb.dll` with their licences. Official Scripts-X is pinned to commit `27e78bc896da239d3738fe02a6d6bf8e9045c16d` with its 831 files unchanged. The fresh account files, blank saves, setup scripts and configuration are distribution scaffolding, separate from the native gameplay source.

The source ZIP includes `SOURCE-INVENTORY.json` with all exported source hashes, `NATIVE-SOURCE-INVENTORY.json` with the 587 verified native build inputs, and public build instructions. `SHA256SUMS-SphereX-2026.10.16-preview.txt` identifies the final downloadable packages. Original projects and dependency source links are listed in the notices.
