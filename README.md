# Turbo Toon Rally Club

Pegue esse ZIP extrai o que tem nele e coloque esse projeto que está no ZIP no ambiente do lovable pra eu continuar no desenvolvimento do projeto aqui no lovable em seguida que vc extrair o projeto e tiver tudo ok seja o que esse prompt logo abaixo está sendo pedido pra vc fazer pra alterar melhorar ect no projeto.



# TURBO TOON — ATUALIZAÇÃO E IMPLEMENTAÇÃO DOS SISTEMAS PRINCIPAIS



Quero que você trabalhe em cima do projeto atual do TURBO TOON. O jogo já possui menu, seleção de pilotos, seleção de veículos, personalização visual, HUD, corrida, pausa e tela de resultados.



**Não quero que você recrie o projeto do zero nem transforme o jogo em um site institucional.** Quero que mantenha a identidade visual, os personagens, os veículos e os recursos que já funcionam, aprimorando e implementando os sistemas abaixo.



## 1. MULTIPLAYER ONLINE — JOGAR NA MESMA SESSÃO



Implemente um sistema multiplayer online funcional, permitindo que diferentes jogadores entrem na mesma partida, cada um utilizando seu próprio computador.



Crie as seguintes opções no menu:



- Jogar sozinho contra bots.

- Jogar localmente com 2 jogadores no mesmo computador.

- Criar sala online.

- Entrar em uma sala existente.

- Entrar utilizando código de convite.



### Sistema de salas



Quando um jogador criar uma sala:

- Gerar um código exclusivo para a partida.

- Permitir copiar e compartilhar o código.

- Mostrar os jogadores que entraram na sala.

- Mostrar os personagens e veículos escolhidos por cada jogador.

- Permitir que o criador escolha a pista e as configurações.

- Ter um botão para iniciar a partida.



Quando outro jogador inserir o código:

- Entrar na mesma sala.

- Visualizar os outros participantes.

- Escolher seu próprio personagem e veículo.

- Aguardar o início da corrida.



O multiplayer precisa ser real, com comunicação em tempo real entre os computadores. Não quero uma simulação visual de multiplayer.



Utilize uma solução de backend adequada, como Supabase Realtime, com sincronização de posição, velocidade, direção, colisões, itens e estado da corrida.



Inclua tratamento para desconexões e reconexões.



## 2. CONTROLES INDEPENDENTES PARA CADA JOGADOR



Esse é um dos pontos mais importantes.



Atualmente, quando dois jogadores jogam no mesmo computador, os controles ficam divididos de maneira incorreta: um jogador consegue acelerar e dar ré, enquanto o outro fica responsável pelas curvas.



Isso está errado.



**Cada jogador precisa controlar completamente seu próprio veículo, de forma independente.**



### Jogador 1 — configuração inicial



- W: acelerar.

- S: dar ré ou frear.

- A: virar para a esquerda.

- D: virar para a direita.

- Espaço: drift.

- Shift: turbo.

- E: utilizar item.



### Jogador 2 — configuração inicial



- Seta para cima: acelerar.

- Seta para baixo: dar ré ou frear.

- Seta para esquerda: virar para a esquerda.

- Seta para direita: virar para a direita.

- Enter: drift.

- Shift direito: turbo.

- Ctrl direito: utilizar item.



Cada jogador precisa conseguir:

- Acelerar e frear.

- Dar ré.

- Virar para os dois lados.

- Fazer drift.

- Utilizar turbo.

- Utilizar itens.

- Controlar todas as funções do seu próprio veículo.



Os controles de um jogador nunca podem interferir nos controles do outro.



### Personalização dos botões



Crie uma tela chamada "Configurar controles".



Nela, cada jogador poderá personalizar individualmente todos os comandos.



Exemplo:

- Clicar em "Acelerar".

- O jogo aguarda uma tecla.

- O jogador pressiona a tecla desejada.

- A nova configuração é salva.



Permita configurar:

- Acelerar.

- Frear.

- Virar para esquerda.

- Virar para direita.

- Drift.

- Turbo.

- Utilizar item.



Inclua:

- Configurações separadas para jogador 1 e jogador 2.

- Botão para restaurar controles padrão.

- Aviso de conflito quando dois comandos utilizarem a mesma tecla.

- Salvamento das configurações para as próximas partidas.



No multiplayer online, cada jogador utiliza os controles configurados no próprio computador.



## 3. DOIS JOGADORES, DOIS PERSONAGENS E DOIS VEÍCULOS



No modo local, os dois jogadores precisam ter seus próprios personagens e veículos.



Cada jogador poderá:

- Escolher seu piloto.

- Escolher seu kart ou veículo.

- Personalizar a cor.

- Escolher acessórios.

- Desenvolver suas habilidades.



Na tela de seleção, deixe claro qual personagem pertence a cada jogador.



Durante a corrida:

- Mostrar os dois veículos na pista.

- Mostrar o nome de cada jogador.

- Mostrar posições e voltas individualmente.

- Cada jogador deve ter sua própria barra de velocidade e informações.

- Os dois veículos precisam responder aos seus respectivos controles.



No multiplayer online, cada participante também deve controlar exclusivamente seu próprio veículo.



## 4. CRIADOR DE PISTAS — TRACK EDITOR



Quero um sistema completo para que o próprio jogador possa criar suas pistas.



Adicione uma opção chamada "Criar pista" no menu principal.



O jogador deverá conseguir construir uma pista personalizada, colocando e organizando os elementos.



### Construção da pista



Permita:

- Criar o traçado da pista.

- Desenhar curvas.

- Criar retas.

- Criar caminhos alternativos.

- Criar atalhos secretos.

- Definir largada e chegada.

- Definir o número de voltas.

- Alterar a largura da pista.

- Modificar o terreno.

- Criar elevações e rampas quando suportadas pela engine.



### Obstáculos



Disponibilize elementos que possam ser adicionados à pista:



- Caixas e barreiras.

- Pneus.

- Cones.

- Pedras.

- Buracos.

- Barreiras móveis.

- Obstáculos giratórios.

- Plataformas.

- Rampas e saltos.

- Armadilhas.

- Objetos destrutíveis.



Os obstáculos precisam ter comportamentos próprios e funcionar durante a corrida.



### Cenários



Permita escolher diferentes ambientes:



- Floresta.

- Deserto.

- Cidade.

- Montanhas.

- Praia.

- Neve.

- Vulcão.

- Pista futurista.



Cada cenário deve possuir elementos visuais próprios.



### Ferramentas do editor



O editor deve possuir:

- Área de construção visual.

- Ferramenta para desenhar a pista.

- Painel de objetos e obstáculos.

- Opção de selecionar, mover, girar e excluir objetos.

- Zoom e movimentação da câmera.

- Botão desfazer e refazer.

- Botão testar pista.

- Botão salvar pista.

- Botão editar pista salva.



As pistas criadas devem poder ser utilizadas nas corridas locais e online.



Crie também uma galeria de pistas personalizadas, mostrando nome, criador e imagem de cada pista.



## 5. MELHORAR AS PISTAS EXISTENTES



As pistas atuais precisam ser mais elaboradas e interessantes.



Quero pistas com:

- Curvas mais variadas.

- Atalhos que realmente economizem tempo.

- Caminhos alternativos.

- Obstáculos que se movimentam.

- Rampas e saltos.

- Trechos estreitos.

- Mudanças no terreno.

- Áreas secretas.

- Elementos interativos.

- Diferentes níveis de dificuldade.



Os atalhos devem ter utilidade real durante a corrida, oferecendo vantagens e também riscos.



Não quero apenas objetos decorativos: os obstáculos, atalhos e elementos da pista precisam afetar a jogabilidade.



## 6. MELHORAR A JOGABILIDADE



Aprimore a física dos veículos:



- Aceleração progressiva.

- Frenagem.

- Ré.

- Direção responsiva.

- Drift funcional.

- Sistema de turbo.

- Colisões entre veículos.

- Colisões com obstáculos.

- Saltos e aterrissagens.

- Diferenças de peso e velocidade entre veículos.



Os veículos devem ter comportamentos diferentes de acordo com seus atributos.



Garanta que a câmera acompanhe os veículos corretamente no modo individual, local e online.



## 7. MODOS DE JOGO



Mantenha e aprimore:

- Corrida rápida.

- Campeonato.

- Melhor de 3 ou 5.

- Corrida contra o tempo.

- Sobrevivência.

- Desafios.

- Multiplayer online.

- Multiplayer local.



Permita escolher pistas oficiais ou pistas criadas pelos jogadores.



## 8. REGRAS IMPORTANTES DE DESENVOLVIMENTO



- Preserve os personagens, veículos e identidade visual já existentes.

- Não remova funcionalidades que já estão funcionando.

- Não crie apenas telas bonitas: implemente as funcionalidades reais.

- Não use botões sem funcionamento.

- Não simule um multiplayer online com jogadores falsos.

- Não divida os controles entre os dois jogadores.

- Cada jogador deve controlar integralmente seu próprio veículo.

- Garanta que o sistema funcione tanto em partidas locais quanto online.

- Salve configurações, pistas e dados necessários.

- Teste os sistemas antes de considerar a implementação concluída.



## 9. ORDEM DE IMPLEMENTAÇÃO



Implemente por etapas, evitando quebrar o jogo existente:



1. Corrigir completamente os controles independentes dos dois jogadores.

2. Implementar a personalização dos controles.

3. Fazer o modo local funcionar corretamente com dois veículos.

4. Implementar o multiplayer online com criação e entrada em salas.

5. Criar o editor de pistas funcional.

6. Melhorar obstáculos, atalhos, cenários e física.

7. Integrar as pistas personalizadas aos modos de jogo.



**RESULTADO ESPERADO:**



Quero que o TURBO TOON seja um jogo de corrida arcade multiplayer completo, no qual dois ou mais jogadores possam competir online na mesma sessão, ou dois jogadores possam disputar no mesmo computador, cada um controlando seu próprio personagem e veículo.



Também quero que os jogadores tenham liberdade para criar suas próprias pistas, adicionar obstáculos, construir atalhos e compartilhar suas criações.



Priorize a jogabilidade real e o funcionamento dos sistemas, não apenas a aparência visual.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1b48ef28-cc92-423c-bf11-ed62e0709a93).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
