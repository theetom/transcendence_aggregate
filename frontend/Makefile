CONTAINER_NAME = frontend_container

all:
	if ! docker images --format '{{.Repository}}' | grep -q '^$(CONTAINER_NAME)$$'; then \
		docker build . -t $(CONTAINER_NAME); \
	fi
	if ! docker ps -a --format '{{.Names}}' | grep -q '^$(CONTAINER_NAME)$$'; then \
		docker run -d -p 5173:5173 --name $(CONTAINER_NAME) $(CONTAINER_NAME); \
	else \
		docker start $(CONTAINER_NAME) > /dev/null; \
	fi

stop:
	if docker ps -a --format '{{.Names}}' | grep -q '^$(CONTAINER_NAME)$$'; then \
		docker stop $(CONTAINER_NAME); \
	fi

clean: stop
	-docker rm $(CONTAINER_NAME)

fclean: clean
	-docker image rm $(CONTAINER_NAME)

re: fclean all

.PHONY: all stop clean fclean re