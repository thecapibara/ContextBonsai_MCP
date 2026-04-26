@class_decorator
class TestProject:
    """Project-level class documentation."""
    
    @method_decorator
    def sync_method(self):
        """A sync method."""
        pass
        
    async def async_method(self, arg1):
        """An async method."""
        pass

@func_decorator
def top_level_func():
    """A top-level function."""
    pass
