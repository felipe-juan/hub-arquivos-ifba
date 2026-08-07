# Assistente do HUB v1.5.7

Frontend do Assistente integrado ao HUB Arquivos IFBA.

Nesta versão, o composer é uma região permanente fora da rolagem. O CSS flexível e a guarda JavaScript impedem o desaparecimento do campo em desktop, celular, teclado virtual, rotação, troca de aba e restauração da página.


O estado `Escrevendo` possui limite rígido e não depende apenas do cancelamento do `fetch`. Durante a resposta, o botão de envio muda para interrupção; o campo permanece disponível e o rascunho digitado é preservado.
