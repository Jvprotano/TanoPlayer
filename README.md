# TanoPlayer

Player desktop para organizar e assistir a cursos em vídeo armazenados no seu computador. O TanoPlayer agrupa aulas por módulo, retoma os vídeos de onde você parou e acompanha seu progresso.

## Baixar para Windows

[**Baixar TanoPlayer para Windows x64 (ZIP portátil)**](https://github.com/Jvprotano/TanoPlayer/releases/latest/download/TanoPlayer-Windows-x64.zip)

1. Clique com o botão direito no ZIP e selecione **Extrair tudo**.
2. Abra a pasta extraída e execute **TanoPlayer.exe**. Mantenha os outros arquivos junto ao executável.
3. Clique em **Adicionar curso** para importar uma pasta ou selecionar vídeos.

O pacote roda sem instalação e já inclui o Electron. Os arquivos de cada versão e seu checksum SHA-256 estão na [página de releases](https://github.com/Jvprotano/TanoPlayer/releases).

## Usar a biblioteca

- Personalize o nome, autor, descrição e capa de cada curso. Cada subpasta de primeiro nível vira um módulo, com arquivos na ordem natural dos nomes.
- O TanoPlayer salva a posição das aulas e marca uma aula como assistida ao acumular 90% de reprodução, inclusive entre sessões. Clique no círculo ao lado da aula para marcar ou desmarcar manualmente.
- Use **Editar curso** para trocar a pasta ou buscar novos vídeos. Aulas com o mesmo caminho relativo conservam o progresso.
- O botão ao lado do caminho de navegação recolhe ou expande o menu lateral e salva sua preferência.
- No player, use **Espaço** ou **K** para reproduzir e pausar, as **setas** para voltar ou avançar dez segundos, **F** para tela cheia e **M** para controlar o som. **Ctrl+K** abre a busca no catálogo.

O catálogo, o progresso e as capas ficam em `%APPDATA%\TanoPlayer`. Os vídeos permanecem nos caminhos originais. Se estiverem em uma unidade externa, conecte-a para assistir. Para um vídeo incompatível com os codecs do Chromium, use **Abrir no Windows** e marque o progresso no catálogo.

## Rodar a partir do código

Em um computador Windows com Node.js 22.12 ou superior, execute na pasta do projeto:

```powershell
npm.cmd ci
npm.cmd start
```

Para empacotar no Windows, execute `npm.cmd run package`. Em um ambiente x64, o executável e seus arquivos serão gerados em `dist\TanoPlayer-win32-x64`.

Use as [Issues](https://github.com/Jvprotano/TanoPlayer/issues) para relatar problemas ou sugerir melhorias.

## Créditos

O catálogo escuro e a seção de retomada têm inspiração em interfaces como [Jellyflix](https://github.com/ocervell/jellyflix) e [Skrin](https://github.com/basswaves/skrin). Os ícones são do [Lucide](https://lucide.dev/), com os avisos de licença em [`src/assets/LICENSE-Lucide.txt`](src/assets/LICENSE-Lucide.txt).
