/*==================================================
PETIT BISCUIT
script.js
==================================================*/

document.addEventListener("DOMContentLoaded", () => {

    /*==========================================
    Atualiza automaticamente o ano do rodapé
    ==========================================*/

    const anoAtual = new Date().getFullYear();

    document.querySelectorAll(".ano").forEach(item => {
        item.textContent = anoAtual;
    });

    /*==========================================
    Header com sombra ao rolar
    ==========================================*/

    const header = document.querySelector("header");

    function atualizarHeader(){

        if(window.scrollY > 15){

            header.classList.add("scroll");

        }else{

            header.classList.remove("scroll");

        }

    }

    atualizarHeader();

    window.addEventListener("scroll", atualizarHeader);

    /*==========================================
    Balão de contato
    ==========================================*/

    const contatoToggle = document.querySelector(".contato-toggle");
    const contatoBalao = document.querySelector(".contato-balao");

    if(contatoToggle && contatoBalao){

        contatoToggle.addEventListener("click", () => {

            const estaAberto = !contatoBalao.hidden;

            contatoBalao.hidden = estaAberto;
            contatoToggle.setAttribute("aria-expanded", String(!estaAberto));

        });

        document.addEventListener("click", event => {

            if(!contatoBalao.hidden && !contatoBalao.contains(event.target) && !contatoToggle.contains(event.target)){

                contatoBalao.hidden = true;
                contatoToggle.setAttribute("aria-expanded", "false");

            }

        });

        document.addEventListener("keydown", event => {

            if(event.key === "Escape"){

                contatoBalao.hidden = true;
                contatoToggle.setAttribute("aria-expanded", "false");

            }

        });

    }

});
