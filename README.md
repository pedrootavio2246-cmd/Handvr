# HandFusion VR v0.5 — protótipo experimental

Protótipo de hand tracking para **iPhone + VR Box**, executado no navegador.

## O que já funciona

- câmera traseira ou frontal;
- rastreamento de até duas mãos;
- 21 pontos por mão;
- identificação de mão esquerda/direita;
- gestos de pinça, mão aberta, punho e apontar;
- suavização ajustável;
- modo VR com imagem dividida para as duas lentes;
- separação estereoscópica ajustável;
- objetos simples que podem ser arrastados com a pinça;
- indicador de FPS e perda de rastreamento.

## Como testar no iPhone

A câmera do navegador exige um endereço seguro. Abrir o `index.html` direto pelo app Arquivos normalmente não funciona.

### Jeito simples: GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, selecione `Deploy from a branch`.
5. Escolha a branch `main` e a pasta `/root`.
6. Abra o endereço HTTPS gerado no Safari.
7. Toque em **Iniciar câmera e rastreamento** e permita o acesso.
8. Gire o iPhone para paisagem e coloque-o no VR Box.

Também é possível publicar a pasta em um serviço de hospedagem estática com HTTPS.

## Uso recomendado

- deixe a câmera traseira do iPhone descoberta;
- use bastante luz;
- mantenha as mãos aproximadamente entre 25 cm e 90 cm da câmera;
- evite colocar uma mão na frente da outra;
- reduza a suavização se sentir muito atraso;
- aumente a suavização se os pontos estiverem tremendo;
- para melhor desempenho, feche outros aplicativos.

## Limitações

Isto não é equivalente ao rastreamento de um Meta Quest. O iPhone usa uma câmera RGB comum e estima a profundidade. Pode haver tremedeira, atraso, perda dos dedos e erro quando as mãos se cruzam.

A primeira abertura precisa de internet para carregar a biblioteca e o modelo do MediaPipe. O processamento dos frames é feito no próprio aparelho pelo código desta versão.

## Arquivos

- `index.html`: interface;
- `style.css`: aparência;
- `app.js`: câmera, MediaPipe, gestos, renderização VR e interação;
- `manifest.webmanifest`: instalação como web app;
- `icon-192.png` e `icon-512.png`: ícones.

## Próximas melhorias possíveis

- calibração específica para o modelo do VR Box;
- estimação de profundidade mais estável;
- modelos de mãos 3D em vez de esqueleto;
- reconhecimento de mais gestos;
- modo de navegador espacial;
- versão nativa iOS em Swift/MediaPipe.


## Correção da v0.2

A v0.1 apontava para uma versão incorreta do pacote MediaPipe no CDN. Isso podia impedir todo o JavaScript de carregar, deixando o botão **Iniciar câmera e rastreamento** sem reação.

A v0.2:
- usa a versão estável 0.10.35;
- carrega o MediaPipe somente depois do toque;
- mostra mensagens de erro na própria tela;
- adiciona cache-busting no `app.js`.


## Novidade da v0.3 — tela espacial do YouTube

1. Inicie a câmera e o rastreamento.
2. Abra **Tela YouTube**.
3. Cole um link de vídeo e toque em **Carregar vídeo**.
4. Toque em **Reproduzir**.
5. Feche o painel.
6. Faça uma pinça sobre a tela virtual e mova a mão para arrastá-la.
7. Use o controle **Tamanho da tela** para redimensionar.

A tela é duplicada para as duas lentes no modo VR. Um player fica com áudio e o outro é mantido mudo e sincronizado.

### Limitações

- O navegador do iPhone pode exigir um toque real no botão Reproduzir.
- A pinça move a janela, mas não clica diretamente dentro do iframe do YouTube.
- Outros sites podem impedir que suas páginas sejam abertas dentro de uma tela incorporada.
- Como o rastreamento vem de uma câmera comum, a janela se move em 2D e não fica ancorada no espaço real como num Meta Quest.


## v0.4 — otimização para Android

A versão 0.4 foi refeita para reduzir travamentos:

- Android inicia automaticamente no modo **Leve**;
- câmera reduzida para 640×480 no modo Leve;
- hand tracking limitado a aproximadamente 11 análises por segundo;
- renderização limitada a 30 FPS no modo Leve;
- apenas uma mão é rastreada no modo Leve;
- resolução interna do canvas reduzida;
- gestos são calculados uma única vez por mão;
- o canvas não é redimensionado em todo frame;
- HUD e layout não atualizam o DOM em todo frame;
- efeitos de blur e sombras são removidos no modo Leve;
- objetos de laboratório começam desligados;
- YouTube usa dois players em VR, em vez de três;
- fora do modo VR, o segundo player fica pausado;
- sincronização do YouTube ocorre com menor frequência.

### Modos

- **Leve:** celulares Android fracos ou intermediários.
- **Equilibrado:** aparelhos intermediários/fortes.
- **Qualidade:** aparelhos fortes; consome mais bateria e esquenta mais.

Para testar desempenho, comece no modo Leve e só aumente se o FPS permanecer estável.


## v0.5 — Google, teclado por gesto e duas mãos

### Novidades

- duas mãos também no modo Leve;
- painel Google arredondado desenhado diretamente no canvas;
- gesto **OK** sustentado por cerca de meio segundo abre ou fecha o teclado;
- teclado QWERTY virtual;
- cada mão possui seu próprio cursor;
- aponte para uma tecla e faça uma pinça rápida para pressioná-la;
- barra de pesquisa, sugestões, Google, Imagens e YouTube;
- cubo 3D leve preso ao lado do painel;
- pinça na barra superior para mover o painel;
- giroscópio cria um efeito espacial 3DoF;
- botão para recentralizar;
- interface desenhada no canvas, sem biblioteca 3D pesada.

### Pesquisa

As sugestões são buscadas por uma função serverless em `api/suggest.js`.
Ao pressionar **Pesquisar**, **Imagens** ou **YouTube**, o navegador abre a página correspondente. O Google não permite controlar seus resultados dentro de um iframe por hand tracking sem uma API própria.

### Otimização

O modo Leve usa:

- câmera 640×360;
- 9 análises de mão por segundo;
- 30 FPS de renderização;
- duas mãos em uma única chamada do MediaPipe;
- canvas em resolução reduzida;
- esqueleto das mãos desligado por padrão;
- painel e teclado desenhados no mesmo canvas;
- nenhum Three.js;
- nenhum modelo 3D pesado;
- cubo 3D desenhado com poucas formas 2D.

### Limitação espacial

O navegador consegue usar o giroscópio para rotação 3DoF. A tela reage ao movimento da cabeça, mas não reconhece com precisão quando o usuário anda para frente ou para o lado. Rastreamento 6DoF verdadeiro exige ARCore/ARKit em aplicativo nativo.

### Como usar

1. Inicie no modo **Leve**.
2. Permita câmera e sensores.
3. Faça o gesto OK mostrado na foto e segure por meio segundo.
4. Aponte o indicador para uma tecla.
5. Faça uma pinça rápida para pressionar.
6. As duas mãos podem pressionar teclas.
7. Faça uma pinça na barra superior para arrastar o painel.
8. Pressione o cubo 3D para recentralizar e alternar o teclado.
