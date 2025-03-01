import yaml
import os

#read yaml file

def load_config():
  current_dir = os.path.dirname(os.path.abspath(__file__))
  config_path = os.path.join(current_dir, 'config.yaml')
  with open(config_path) as file:
    config= yaml.safe_load(file)

  return config
