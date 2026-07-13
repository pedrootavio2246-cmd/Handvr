# HandFusion VR v0.6 — 3D real

Versão web/PWA com painel, teclado, cubo e mãos construídos como geometria
Three.js real.

## O que mudou

- painel com espessura, laterais e parte traseira;
- é possível girar o painel e enxergar sua traseira;
- teclado 3D com base e teclas elevadas;
- cubo 3D preso ao lado do painel;
- duas mãos rastreadas pelo MediaPipe;
- cursores e esqueletos das mãos desenhados na cena 3D;
- pinça para pressionar campo, botões, sugestões e teclas;
- gesto OK sustentado abre ou fecha o teclado;
- pinça na barra superior move todo o painel;
- Google, Imagens e YouTube;
- modo VR Box com tela dividida;
- modo AR 6DoF experimental em Android compatível.

## Como controlar

1. Aponte o indicador para um objeto.
2. Faça uma pinça rápida para clicar.
3. Faça pinça na barra superior para arrastar o painel.
4. Segure o gesto OK por aproximadamente meio segundo para abrir o teclado.
5. O cubo 3D gira o painel em 45 graus.
6. As duas mãos podem pressionar teclas.

## Modos de rastreamento espacial

### VR Box 3D

O painel é um objeto 3D verdadeiro e permanece na direção em que foi
colocado quando o celular gira. É rastreamento 3DoF: rotação da cabeça,
sem posição física precisa.

### AR 6DoF experimental

Em Chrome Android, aparelho compatível com ARCore e Google Play Services
for AR, o botão `Entrar no AR 6DoF` usa WebXR. Nesse modo o painel fica
fixo no espaço e o usuário pode andar ao redor e enxergar a parte
traseira.

A câmera é entregue ao ARCore durante a sessão WebXR. Por isso o
hand tracking por MediaPipe é pausado no modo AR e volta quando a sessão
termina.

## Otimização

Modo Leve:

- câmera 640×360;
- duas mãos em uma chamada do MediaPipe;
- 9 inferências por segundo;
- renderização limitada a 30 FPS;
- resolução WebGL reduzida;
- nenhum sistema de sombras;
- materiais básicos;
- teclado usando InstancedMesh;
- uma única textura para todos os rótulos do teclado;
- texturas sem mipmaps;
- poucos segmentos nas bordas arredondadas.

## Publicação no Vercel

Envie todos os arquivos desta pasta mantendo:

```text
api/
└── suggest.js
```

O arquivo `index.html` deve ficar na raiz.

## Limitações

- Pesquisa abre a página real do Google/YouTube.
- Sites externos normalmente bloqueiam incorporação completa em iframe.
- WebXR AR não está disponível em todos os navegadores e aparelhos.
- iPhone usa o modo VR Box 3D, não o modo WebXR AR desta versão.
