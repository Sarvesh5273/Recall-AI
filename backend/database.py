import os
import logging
from dotenv import load_dotenv
from azure.cosmos import CosmosClient, PartitionKey, exceptions

# Load environment variables from the .env file
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CosmosDBConnector:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CosmosDBConnector, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initializes the connection to Azure Cosmos DB."""
        self.endpoint = os.getenv("COSMOS_DB_ENDPOINT")
        self.key = os.getenv("COSMOS_DB_KEY")
        self.db_name = os.getenv("COSMOS_DB_DATABASE_NAME")
        self.container_name = os.getenv("COSMOS_DB_CONTAINER_NAME")

        if not all([self.endpoint, self.key, self.db_name, self.container_name]):
            raise ValueError("Critical Error: Missing Cosmos DB credentials in .env file.")

        try:
            logger.info("Connecting to Azure Cosmos DB Serverless...")
            self.client = CosmosClient(self.endpoint, self.key)
            
            # This will create the database and container if they don't exist yet
            self.database = self.client.create_database_if_not_exists(id=self.db_name)
            self.container = self.database.create_container_if_not_exists(
                id=self.container_name, 
                partition_key=PartitionKey(path="/shop_id"),
                offer_throughput=None # Must be None for Serverless
            )
            logger.info("Cosmos DB connection established successfully.")
            
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to connect to Cosmos DB: {str(e)}")
            raise

    def get_container(self):
        """Returns the active container client for database operations."""
        return self.container

# Initialize the connector
db = CosmosDBConnector()