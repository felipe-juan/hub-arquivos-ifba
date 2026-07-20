# Runtime local do js-dos

O pacote-base não inclui os binários do emulador nem o bundle do jogo. Para uma publicação estável, instale-os localmente antes de testar e commitar:

```bash
bash scripts/vendor_doom_assets.sh
python3 scripts/check_doom_runtime.py
```

O instalador:

- fixa `js-dos` e `emulators` na mesma versão;
- baixa tudo para uma pasta temporária;
- verifica JavaScript, CSS, WebAssembly e o arquivo `.jsdos`;
- calcula checksums;
- só substitui uma instalação anterior depois de todas as verificações passarem;
- ativa `runtime-manifest.json` somente ao final.

Quando o manifesto declara `localAssets: true`, o Easter Egg usa os arquivos locais primeiro. As fontes remotas permanecem apenas como contingência.

Os arquivos do emulador e o bundle do jogo possuem licenças e direitos próprios. Verifique os termos aplicáveis antes de redistribuí-los no repositório público.
