const fs = require("fs");
const os = require("os");
const path = require("path");

function run() {
    let payload = {};
    try {
        const stdin = fs.readFileSync(0, "utf-8");
        payload = JSON.parse(stdin);
    } catch(e) {}

    const toolInput = payload.tool_input || {};
    const toolName = payload.tool_name || payload.name || "";

    // 1. Pular interceptação caso o agente esteja operando ferramentas nativas de Time Tracking, 
    // ou seja, se for o momento exato em que ele está tentando iniciar o cronômetro, não bloqueie.
    // Ignoramos também a ask_permission/ask_question porque são ações UI
    const isTimerTool = toolName.includes("timer") || 
                        toolName.includes("ping_activity") || 
                        toolName.includes("time_entry") || 
                        toolName.includes("create_project") ||
                        toolName.includes("ask_");

    if (isTimerTool) {
        process.exit(0);
    }

    const activityFile = path.join(os.homedir(), ".sarak_activity.json");
    let isRunning = false;
    
    try {
        if (fs.existsSync(activityFile)) {
            const data = JSON.parse(fs.readFileSync(activityFile, "utf-8"));
            if (data.is_running) {
                isRunning = true;
                // Hook escreve em milissegundos para o python validar o ping físico!
                data.last_activity = Date.now();
                fs.writeFileSync(activityFile, JSON.stringify(data));
            }
        }
    } catch(e) {}

    // 2. Catraca de Bloqueio (Obrigatório)
    if (!isRunning) {
        console.log(JSON.stringify({
            hookSpecificOutput: {
                permissionDecision: "deny",
                additionalContext: "ACESSO NEGADO (Catraca Sarak). O cronômetro obrigatório não está rodando. O sistema exige que você inicie o timer para liberar suas ações.\n\nInstrução para a IA: Use a ferramenta 'start_timer' AGORA MESMO. Extraia o nome da tarefa do seu prompt/contexto usando a nomenclatura correta: '[{Categoria}] {Branch_ou_Módulo} — {Resumo_da_Tarefa}'."
            }
        }));
        process.exit(0);
    }
}

run();
