const statusBox = document.getElementById("api-status");
const button = document.getElementById("start-button");

button.addEventListener("click", () => {
  alert("Bem-vindo ao Controle de Ponto OM Way!");
});

fetch("/api/health")
  .then((res) => res.json())
  .then((data) => {
    statusBox.textContent = `Status da API: ${data.status} (${data.time})`;
  })
  .catch(() => {
    statusBox.textContent = "Status da API: indisponível";
  });
