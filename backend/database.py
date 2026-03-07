import os
import logging
from dotenv import load_dotenv
from azure.cosmos import CosmosClient, PartitionKey, exceptions

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
        self.endpoint = os.getenv("COSMOS_DB_ENDPOINT")
        self.key = os.getenv("COSMOS_DB_KEY")
        self.db_name = os.getenv("COSMOS_DB_DATABASE_NAME")
        self.container_name = os.getenv("COSMOS_DB_CONTAINER_NAME")
        self.training_container_name = os.getenv("COSMOS_DB_TRAINING_CONTAINER_NAME", "recall-training")

        if not all([self.endpoint, self.key, self.db_name, self.container_name]):
            raise ValueError("Critical Error: Missing Cosmos DB credentials in .env file.")

        try:
            logger.info("Connecting to Azure Cosmos DB Serverless...")
            self.client = CosmosClient(self.endpoint, self.key)

            self.database = self.client.create_database_if_not_exists(id=self.db_name)

            # Main container — inventory, accounts, usage
            self.container = self.database.create_container_if_not_exists(
                id=self.container_name,
                partition_key=PartitionKey(path="/shop_id"),
                offer_throughput=None
            )

            # Training container — crowdsourced OCR mappings (separate for clean ML pipeline)
            self.training_container = self.database.create_container_if_not_exists(
                id=self.training_container_name,
                partition_key=PartitionKey(path="/raw_ocr"),
                offer_throughput=None
            )

            logger.info("Cosmos DB connection established successfully.")
            logger.info(f"Main: {self.container_name} | Training: {self.training_container_name}")

        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Failed to connect to Cosmos DB: {str(e)}")
            raise

    def get_container(self):
        """Main container — inventory, accounts, usage."""
        return self.container

    def get_training_container(self):
        """Training container — OCR mapping signals from all shops."""
        return self.training_container

# Initialize the connector
db = CosmosDBConnector()