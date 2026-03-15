#!/bin/bash

# ============================================================
#  SCRIPT PARA SUBIR CAMBIOS A TU RAMA PERSONAL
#  Uso: ./subir-cambios.sh
# ============================================================

# ▼▼▼ CAMBIA ESTE VALOR POR EL NOMBRE DE TU RAMA ▼▼▼
nombreRama="Omar"
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

# --- Colores para mensajes ---
VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
AZUL='\033[0;34m'
RESET='\033[0m'

echo ""
echo -e "${AZUL}============================================${RESET}"
echo -e "${AZUL}       SUBIR CAMBIOS A TU RAMA             ${RESET}"
echo -e "${AZUL}============================================${RESET}"
echo ""

# Verificar que se ha configurado el nombre de rama
if [ -z "$nombreRama" ]; then
    echo -e "${ROJO}ERROR: No has configurado tu nombre de rama.${RESET}"
    echo -e "Abre el archivo ${AMARILLO}subir-cambios.sh${RESET} y edita la variable ${AMARILLO}nombreRama${RESET}."
    echo -e "Ejemplo: ${VERDE}nombreRama=\"ana\"${RESET}"
    echo ""
    exit 1
fi

echo -e "Rama de trabajo: ${VERDE}$nombreRama${RESET}"
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

# Paso 2: Descargar los últimos cambios del servidor
echo -e "${AMARILLO}[2/4] Descargando los últimos cambios del servidor...${RESET}"
git pull origin "$nombreRama" 2>&1
PULL_RESULTADO=$?

if [ $PULL_RESULTADO -ne 0 ]; then
    echo ""
    echo -e "${ROJO}ERROR: Hubo un problema al descargar los cambios.${RESET}"
    echo -e "Puede haber un conflicto. Contacta con el responsable del proyecto."
    echo ""
    exit 1
fi
echo -e "${VERDE}OK - Rama actualizada${RESET}"
echo ""

# Paso 3: Ver qué archivos han cambiado
echo -e "${AMARILLO}[3/4] Archivos modificados:${RESET}"
git status --short
echo ""

# Comprobar si hay cambios para subir
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${VERDE}No hay cambios nuevos que subir. ¡Tu rama ya está al día!${RESET}"
    echo ""
    exit 0
fi

# Pedir mensaje del commit
echo -e "Escribe un mensaje breve describiendo qué has hecho:"
echo -e "${AZUL}(Ejemplo: 'Añadir pantalla de login', 'Arreglar bug en el menú')${RESET}"
echo -n "> "
read mensajeCommit

if [ -z "$mensajeCommit" ]; then
    echo ""
    echo -e "${ROJO}ERROR: El mensaje no puede estar vacío.${RESET}"
    echo ""
    exit 1
fi

# Paso 4: Guardar y subir los cambios
echo ""
echo -e "${AMARILLO}[4/4] Guardando y subiendo los cambios...${RESET}"

git add .
git commit -m "$mensajeCommit"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${ROJO}ERROR: No se pudo crear el commit.${RESET}"
    echo ""
    exit 1
fi

git push origin "$nombreRama"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${ROJO}ERROR: No se pudo subir al servidor.${RESET}"
    echo -e "Comprueba tu conexión a internet o contacta con el responsable."
    echo ""
    exit 1
fi

echo ""
echo -e "${VERDE}============================================${RESET}"
echo -e "${VERDE}  ¡Cambios subidos correctamente!           ${RESET}"
echo -e "${VERDE}============================================${RESET}"
echo ""
