#!/bin/bash

# ============================================================
#  SCRIPT PARA TRAERSE LOS CAMBIOS DE MASTER A TU RAMA
#  Uso: ./actualizar-desde-master.sh
# ============================================================

# ▼▼▼ CAMBIA ESTE VALOR POR EL NOMBRE DE TU RAMA ▼▼▼
nombreRama="Zuleima"
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

# --- Colores para mensajes ---
VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
AZUL='\033[0;34m'
RESET='\033[0m'

echo ""
echo -e "${AZUL}============================================${RESET}"
echo -e "${AZUL}   ACTUALIZAR TU RAMA DESDE MASTER         ${RESET}"
echo -e "${AZUL}============================================${RESET}"
echo ""

# Verificar que se ha configurado el nombre de rama
if [ -z "$nombreRama" ]; then
    echo -e "${ROJO}ERROR: No has configurado tu nombre de rama.${RESET}"
    echo -e "Abre el archivo ${AMARILLO}actualizar-desde-master.sh${RESET} y edita la variable ${AMARILLO}nombreRama${RESET}."
    echo -e "Ejemplo: ${VERDE}nombreRama=\"ana\"${RESET}"
    echo ""
    exit 1
fi

echo -e "Rama de trabajo: ${VERDE}$nombreRama${RESET}"
echo -e "Se traerán los cambios de: ${VERDE}master${RESET}"
echo ""

# Paso 1: Asegurarse de estar en la rama correcta
echo -e "${AMARILLO}[1/4] Cambiando a tu rama '$nombreRama'...${RESET}"
git checkout "$nombreRama" 2>&1
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${ROJO}ERROR: No se pudo cambiar a la rama '$nombreRama'.${RESET}"
    echo -e "Comprueba que el nombre de la rama es correcto."
    echo ""
    exit 1
fi
echo -e "${VERDE}OK${RESET}"
echo ""

# Paso 2: Actualizar tu rama con los últimos cambios del servidor
echo -e "${AMARILLO}[2/4] Actualizando tu rama con los últimos cambios del servidor...${RESET}"
git pull origin "$nombreRama" 2>&1
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${ROJO}ERROR: Hubo un problema al actualizar tu rama.${RESET}"
    echo -e "Contacta con el responsable del proyecto."
    echo ""
    exit 1
fi
echo -e "${VERDE}OK${RESET}"
echo ""

# Paso 3: Descargar los últimos cambios de master
echo -e "${AMARILLO}[3/4] Descargando los últimos cambios de master...${RESET}"
git fetch origin master 2>&1
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${ROJO}ERROR: No se pudieron descargar los cambios de master.${RESET}"
    echo -e "Comprueba tu conexión a internet."
    echo ""
    exit 1
fi
echo -e "${VERDE}OK${RESET}"
echo ""

# Paso 4: Integrar los cambios de master en tu rama
echo -e "${AMARILLO}[4/4] Integrando los cambios de master en tu rama '$nombreRama'...${RESET}"
git merge origin/master --no-edit 2>&1
MERGE_RESULTADO=$?

if [ $MERGE_RESULTADO -ne 0 ]; then
    echo ""
    echo -e "${ROJO}============================================${RESET}"
    echo -e "${ROJO}  CONFLICTO DETECTADO                       ${RESET}"
    echo -e "${ROJO}============================================${RESET}"
    echo ""
    echo -e "Hay cambios en master que entran en conflicto con tu rama."
    echo -e "Necesitas resolver el conflicto manualmente o pedir ayuda."
    echo ""
    echo -e "Archivos con conflicto:"
    git diff --name-only --diff-filter=U
    echo ""
    echo -e "${AMARILLO}Para cancelar el merge y volver al estado anterior, ejecuta:${RESET}"
    echo -e "${AZUL}  git merge --abort${RESET}"
    echo ""
    exit 1
fi

echo ""
echo -e "${VERDE}============================================${RESET}"
echo -e "${VERDE}  ¡Tu rama está actualizada con master!     ${RESET}"
echo -e "${VERDE}============================================${RESET}"
echo ""
