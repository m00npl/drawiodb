# DrawIO Arkiv - Deployment Configuration

## Docker Images & Containers

### Production Configuration
- **Docker Image**: `moonplkr/drawio-simple:latest`
- **Container Name**: `drawio-simple`
- **Port**: `8900:8080`
- **URL**: http://drawiodb.online

## Deployment Workflow

### Standard Deployment Process
Używany konsystentnie w całym projekcie:

1. **Build i push Docker image:**
```bash
docker buildx build -t moonplkr/drawio-simple:latest . --push
```

2. **Deploy na serwer:**
```bash
ssh ubuntu@moon.dev.golem.network "cd /home/ubuntu/projects/drawio && docker compose down && docker rmi moonplkr/drawio-simple:latest && docker compose up -d"
```

3. **Sprawdź logi kontenera:**
```bash
ssh ubuntu@moon.dev.golem.network "docker logs drawio-simple --tail=20"
```

### Szczegółowy proces:
1. **Lokalne zmiany** - edytuj pliki w `/Users/moon/drawio/`
2. **Build** - używaj `--no-cache` dla pewności
3. **Push** - automatycznie w ramach buildx z flagą `--push`
4. **Pull na serwerze** - poprzez `docker compose down` i usunięcie starego image
5. **Restart** - `docker compose up -d`
6. **Weryfikacja** - sprawdź logi i funkcjonalność

### Alternative Commands (deprecated)
```bash
# Stara metoda (używana wcześniej)
ssh ubuntu@moon.dev.golem.network "cd /home/ubuntu/projects/drawio && docker compose pull && docker compose up -d"
```

### Files Structure
- **Source**: `/Users/moon/drawio/drawio-custom/golem-db-plugin.js`
- **Container**: `/app/public/js/golem-db-plugin.js`
- **Docker Compose**: `/home/ubuntu/projects/drawio/docker-compose.yml`

## IMPORTANT NOTES
- **ALWAYS** use `moonplkr/drawio-simple:latest` - not golemdb, not golem, not app
- **Container name** is consistently `drawio-simple`
- **Never change** these names without updating this file first!