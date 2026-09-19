all:
	docker compose -f docker-compose.yml up --build -d

restart:
	docker compose -f docker-compose.yml restart

stop:
	docker compose -f docker-compose.yml down

clean: stop
	docker system prune -a --force

re: clean all

.PHONY: all restart stop clean re