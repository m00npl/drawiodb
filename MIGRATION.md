# Migracja z golem-base-sdk na arkiv-sdk

## Zmiany w kodzie

### 1. Pakiet SDK
- **Stara wersja:** `golem-base-sdk@0.1.15`
- **Nowa wersja:** `arkiv-sdk@latest` (obecnie 0.1.18)

### 2. Typy API
- `GolemBaseClient` → `ArkivClient`
- `GolemBaseROClient` → `ArkivROClient`
- `GolemService` → `ArkivService`

### 3. Zmienne środowiskowe

**WAŻNE:** Kod wspiera zarówno stare jak i nowe nazwy zmiennych dla zachowania kompatybilności wstecznej.

#### Stare nazwy (nadal działają):
```bash
GOLEM_CHAIN_ID=60138453025
GOLEM_PRIVATE_KEY=your_private_key_here
GOLEM_RPC_URL=https://kaolin.hoodi.arkiv.network/rpc
GOLEM_WS_URL=wss://kaolin.hoodi.arkiv.network/rpc/ws
```

#### Nowe nazwy (zalecane):
```bash
ARKIV_CHAIN_ID=60138453025
ARKIV_PRIVATE_KEY=your_private_key_here
ARKIV_RPC_URL=https://kaolin.hoodi.arkiv.network/rpc
ARKIV_WS_URL=wss://kaolin.hoodi.arkiv.network/rpc/ws
```

## Instrukcje wdrożenia na produkcji

### Opcja 1: Bezpieczna migracja (zalecane)
Kod wspiera obie wersje zmiennych - nie musisz nic zmieniać w .env na produkcji.

1. Build nowej wersji:
```bash
bun install
bun run build
docker buildx build --no-cache -t moonplkr/drawio-golem-backend:latest --platform linux/amd64,linux/arm64 --push .
```

2. Na serwerze:
```bash
ssh ubuntu@moon.dev.golem.network
cd /path/to/drawio
docker pull moonplkr/drawio-golem-backend:latest
docker compose down
docker compose up -d
```

3. Sprawdź logi:
```bash
docker logs -f drawio-golem-backend
```

### Opcja 2: Pełna migracja zmiennych
Jeśli chcesz zaktualizować nazwy zmiennych:

1. Na serwerze, edytuj `.env`:
```bash
ssh ubuntu@moon.dev.golem.network
cd /path/to/drawio
nano .env
```

2. Zmień nazwy:
```bash
# Stare (usuń lub zostaw dla kompatybilności)
# GOLEM_CHAIN_ID=60138453025
# GOLEM_PRIVATE_KEY=xxx
# GOLEM_RPC_URL=https://kaolin.hoodi.arkiv.network/rpc
# GOLEM_WS_URL=wss://kaolin.hoodi.arkiv.network/rpc/ws

# Nowe
ARKIV_CHAIN_ID=60138453025
ARKIV_PRIVATE_KEY=xxx
ARKIV_RPC_URL=https://kaolin.hoodi.arkiv.network/rpc
ARKIV_WS_URL=wss://kaolin.hoodi.arkiv.network/rpc/ws
```

3. Deploy jak w Opcji 1

### Jeśli używasz Vault (docker-compose.secrets.yml)

Plik `docker-compose.secrets.yml` został już zaktualizowany z nowymi nazwami zmiennych.

Nie wymaga to dodatkowych zmian w Vault - tylko restart kontenerów:

```bash
ssh ubuntu@moon.dev.golem.network
cd /path/to/drawio
docker pull moonplkr/drawio-golem-backend:latest
docker compose -f docker-compose.secrets.yml down
docker compose -f docker-compose.secrets.yml up -d
```

## Sprawdzenie wdrożenia

1. Sprawdź logi backendu:
```bash
docker logs -f drawio-golem-backend
```

2. Powinno pojawić się:
```
Initializing Arkiv connection...
✅ Arkiv initialized successfully
```

3. Test API:
```bash
curl https://api.drawiodb.online/health
```

## Rollback

Jeśli coś pójdzie nie tak:

```bash
ssh ubuntu@moon.dev.golem.network
cd /path/to/drawio
docker tag moonplkr/drawio-golem-backend:latest moonplkr/drawio-golem-backend:backup-$(date +%Y%m%d)
# Przywróć poprzednią wersję z Docker Hub
docker pull moonplkr/drawio-golem-backend:previous-tag
docker compose down
docker compose up -d
```

## Ważne uwagi

1. **Kompatybilność wsteczna:** Kod wspiera obie wersje zmiennych (GOLEM_* i ARKIV_*), więc możesz wdrożyć bez zmian w .env
2. **Pierwszeństwo:** Jeśli ustawione są obie wersje, ARKIV_* ma pierwszeństwo
3. **URLs:** Upewnij się, że RPC/WS URLs są poprawne dla twojego środowiska
4. **Private Key:** Jeśli nie jest ustawiony, backend działa w trybie read-only (użytkownicy muszą używać MetaMask)

## Pytania?

Sprawdź logi: `docker logs -f drawio-golem-backend`
